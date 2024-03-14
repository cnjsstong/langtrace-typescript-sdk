import { SERVICE_PROVIDERS } from '@langtrace-constants/instrumentation/common'
import { APIS } from '@langtrace-constants/instrumentation/openai'
import { calculatePromptTokens, estimateTokens } from '@langtrace-utils/llm'
import { Event, LLMSpanAttributes } from '@langtrase/trace-attributes'
import {
  Exception,
  Span,
  SpanKind,
  SpanStatusCode,
  Tracer,
  context,
  trace
} from '@opentelemetry/api'

export function imagesGenerate (
  originalMethod: (...args: any[]) => any,
  tracer: Tracer,
  version: string
): (...args: any[]) => any {
  return async function (this: any, ...args: any[]) {
    const originalContext = this

    // Determine the service provider
    let serviceProvider = SERVICE_PROVIDERS.OPENAI
    if (originalContext?._client?.baseURL?.includes('azure') === true) {
      serviceProvider = SERVICE_PROVIDERS.AZURE
    }

    const attributes: LLMSpanAttributes = {
      'langtrace.service.name': serviceProvider,
      'langtrace.service.type': 'llm',
      'langtrace.service.version': version,
      'langtrace.version': '1.0.0',
      'url.full': originalContext?._client?.baseURL,
      'llm.api': APIS.IMAGES_GENERATION.ENDPOINT,
      'llm.model': args[0]?.model,
      'http.max.retries': originalContext?._client?.maxRetries,
      'http.timeout': originalContext?._client?.timeout,
      'llm.prompts': JSON.stringify([args[0]?.prompt])
    }

    return await context.with(
      trace.setSpan(context.active(), trace.getSpan(context.active()) as Span),
      async () => {
        const span = tracer.startSpan(APIS.IMAGES_GENERATION.METHOD, {
          kind: SpanKind.SERVER
        })
        span.setAttributes(attributes)
        try {
          const response = await originalMethod.apply(originalContext, args)
          attributes['llm.responses'] = JSON.stringify(response?.data)
          span.setStatus({ code: SpanStatusCode.OK })
          span.end()
          return response
        } catch (error: any) {
          span.recordException(error as Exception)
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message
          })
          span.end()
          throw error
        }
      }
    )
  }
}

export function chatCompletionCreate (
  originalMethod: (...args: any[]) => any,
  tracer: Tracer,
  version: string
): (...args: any[]) => any {
  return async function (this: any, ...args: any[]) {
    const originalContext = this

    // Determine the service provider
    let serviceProvider = SERVICE_PROVIDERS.OPENAI
    if (originalContext?._client?.baseURL?.includes('azure') === true) {
      serviceProvider = SERVICE_PROVIDERS.AZURE
    }

    const attributes: LLMSpanAttributes = {
      'langtrace.service.name': serviceProvider,
      'langtrace.service.type': 'llm',
      'langtrace.service.version': version,
      'langtrace.version': '1.0.0',
      'url.full': originalContext?._client?.baseURL,
      'llm.api': APIS.CHAT_COMPLETION.ENDPOINT,
      'llm.model': args[0]?.model,
      'http.max.retries': originalContext?._client?.maxRetries,
      'http.timeout': originalContext?._client?.timeout,
      'llm.prompts': JSON.stringify(args[0]?.messages)
    }

    if (args[0]?.temperature !== undefined) {
      attributes['llm.temperature'] = args[0]?.temperature
    }

    if (args[0]?.top_p !== undefined) {
      attributes['llm.top_p'] = args[0]?.top_p
    }

    if (args[0]?.user !== undefined) {
      attributes['llm.user'] = args[0]?.user
    }

    if (args[0]?.functions !== undefined) {
      attributes['llm.function.prompts'] = JSON.stringify(args[0]?.functions)
    }

    if (!(args[0].stream as boolean) || args[0].stream === false) {
      return await context.with(
        trace.setSpan(
          context.active(),
          trace.getSpan(context.active()) as Span
        ),
        async () => {
          const span = tracer.startSpan(APIS.CHAT_COMPLETION.METHOD, {
            kind: SpanKind.CLIENT
          })
          span.setAttributes(attributes)
          try {
            const resp = await originalMethod.apply(this, args)
            const responses = resp?.choices?.map((choice: any) => {
              const result: Record<string, any> = {}
              result.message = choice?.message
              if (choice?.content_filter_results !== undefined) {
                result.content_filter_results =
                  choice?.content_filter_results
              }
              return result
            })
            span.setAttributes({
              'llm.responses': JSON.stringify(responses)
            })

            if (resp?.system_fingerprint !== undefined) {
              span.setAttributes({
                'llm.system.fingerprint': resp?.system_fingerprint
              })
            }
            span.setAttributes({
              'llm.token.counts': JSON.stringify({
                prompt_tokens: (Boolean((resp?.usage?.prompt_tokens))) || 0,
                completion_tokens: (Boolean((resp?.usage?.completion_tokens))) || 0,
                total_tokens: (Boolean((resp?.usage?.total_tokens))) || 0
              })
            })
            span.setStatus({ code: SpanStatusCode.OK })
            return resp
          } catch (error: any) {
            span.recordException(error as Exception)
            span.setStatus({
              code: SpanStatusCode.ERROR,
              message: error.message
            })
            throw error
          } finally {
            span.end()
          }
        }
      )
    } else {
      return await context.with(
        trace.setSpan(
          context.active(),
          trace.getSpan(context.active()) as Span
        ),
        async () => {
          const span = tracer.startSpan(APIS.CHAT_COMPLETION.METHOD, {
            kind: SpanKind.CLIENT
          })
          span.setAttributes(attributes)
          const model = args[0].model
          const promptContent = JSON.stringify(args[0].messages[0])
          const promptTokens = calculatePromptTokens(promptContent, model as string)
          const resp = await originalMethod.apply(this, args)
          return handleStreamResponse(
            span,
            resp,
            promptTokens,
            args[0]?.functions as boolean ?? false
          )
        }
      )
    }
  }
}

async function * handleStreamResponse (
  span: Span,
  stream: any,
  promptTokens: number,
  functionCall = false
): any {
  let completionTokens = 0
  const result: string[] = []

  span.addEvent(Event.STREAM_START)
  try {
    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content ?? ''
      const tokenCount = estimateTokens(content as string)
      completionTokens += tokenCount
      result.push(content as string)
      span.addEvent(Event.STREAM_OUTPUT, {
        tokens: tokenCount,
        response: JSON.stringify(content)
      })
      yield chunk
    }

    span.setStatus({ code: SpanStatusCode.OK })
    span.setAttributes({
      'llm.token.counts': JSON.stringify({
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: completionTokens + promptTokens
      }),
      'llm.responses': functionCall
        ? JSON.stringify([
          { message: { role: 'assistant', function_call: result.join('') } }
        ])
        : JSON.stringify([
          { message: { role: 'assistant', content: result.join('') } }
        ])
    })
    span.addEvent(Event.STREAM_END)
  } catch (error: any) {
    span.recordException(error as Exception)
    span.setStatus({ code: SpanStatusCode.ERROR, message: error.message })
    throw error
  } finally {
    span.end()
  }
}

export function embeddingsCreate (
  originalMethod: (...args: any[]) => any,
  tracer: Tracer,
  version: string
): (...args: any[]) => any {
  return async function (this: any, ...args: any[]) {
    const originalContext = this

    // Determine the service provider
    let serviceProvider = SERVICE_PROVIDERS.OPENAI
    if (originalContext?._client?.baseURL?.includes('azure') === true) {
      serviceProvider = SERVICE_PROVIDERS.AZURE
    }

    const attributes: LLMSpanAttributes = {
      'langtrace.service.name': serviceProvider,
      'langtrace.service.type': 'llm',
      'langtrace.service.version': version,
      'langtrace.version': '1.0.0',
      'url.full': originalContext?._client?.baseURL,
      'llm.api': APIS.EMBEDDINGS_CREATE.ENDPOINT,
      'llm.model': args[0]?.model,
      'http.max.retries': originalContext?._client?.maxRetries,
      'http.timeout': originalContext?._client?.timeout,
      'llm.stream': args[0]?.stream,
      'llm.prompts': JSON.stringify(args[0]?.prompts)
    }

    if (args[0]?.encoding_format !== undefined) {
      attributes['llm.encoding.format'] = args[0]?.encoding_format
    }

    if (args[0]?.dimensions !== undefined) {
      attributes['llm.dimensions'] = args[0]?.dimensions
    }

    if (args[0]?.user !== undefined) {
      attributes['llm.user'] = args[0]?.user
    }

    return await context.with(
      trace.setSpan(context.active(), trace.getSpan(context.active()) as Span),
      async () => {
        const span = tracer.startSpan(APIS.EMBEDDINGS_CREATE.METHOD, {
          kind: SpanKind.SERVER
        })
        span.setAttributes(attributes)
        try {
          const resp = await originalMethod.apply(originalContext, args)

          span.setStatus({ code: SpanStatusCode.OK })
          span.end()
          return resp
        } catch (error: any) {
          span.recordException(error as Exception)
          span.setStatus({
            code: SpanStatusCode.ERROR,
            message: error.message
          })
          span.end()
          throw error
        }
      }
    )
  }
}