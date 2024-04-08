/*
 * Copyright (c) 2024 Scale3 Labs
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import { APIS } from '@langtrace-constants/instrumentation/chroma'
import { diag } from '@opentelemetry/api'
import { InstrumentationModuleDefinition, InstrumentationNodeModuleDefinition, isWrapped } from '@opentelemetry/instrumentation'
import { ChromaClient, Collection } from 'chromadb'
import { collectionPatch } from '@langtrace-instrumentation/chroma/patch'
import { LangtraceInstrumentationBase, Patch } from '@langtrace-instrumentation/index'

class ChromaInstrumentation extends LangtraceInstrumentationBase<any> implements Patch {
  public manualPatch (chroma: typeof ChromaClient, moduleName: string): void {
    if (moduleName !== 'chromadb') {
      return this.nextManualPatcher?.manualPatch(chroma, moduleName)
    }
    diag.debug('Manually instrumenting ChromaDB')
    this._patch(chroma)
  }

  init (): Array<InstrumentationModuleDefinition<typeof Collection>> {
    const module = new InstrumentationNodeModuleDefinition<typeof Collection>(
      'chromadb',
      ['>=1.8.1'],
      (moduleExports, moduleVersion) => {
        diag.debug(`Patching ChromaDB SDK version ${moduleVersion}`)
        this._patch(moduleExports, moduleVersion as string)
        return moduleExports
      },
      (moduleExports, moduleVersion) => {
        diag.debug(`Unpatching ChromaDB SDK version ${moduleVersion}`)
        if (moduleExports !== undefined) {
          this._unpatch(moduleExports)
        }
      }
    )

    return [module]
  }

  private _patch (chromadb: any, moduleVersion?: string): void {
    if (isWrapped(chromadb.Collection.prototype)) {
      Object.keys(APIS).forEach((api) => {
        this._unwrap(chromadb.Collection.prototype, APIS[api].OPERATION)
      })
    }

    Object.keys(APIS).forEach((api) => {
      this._wrap(
        chromadb.Collection.prototype,
        APIS[api].OPERATION,
        (originalMethod: (...args: any[]) => any) =>
          collectionPatch(originalMethod, api, this.tracer, this.instrumentationVersion, moduleVersion)
      )
    })
  }

  private _unpatch (chromadb: any): void {
    Object.keys(APIS).forEach((api) => {
      this._unwrap(chromadb.Collection.prototype, APIS[api].OPERATION)
    })
  }
}

export const chromaInstrumentation = new ChromaInstrumentation()
