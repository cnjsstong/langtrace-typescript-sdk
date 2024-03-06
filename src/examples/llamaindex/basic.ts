import { init } from "@langtrace-init/init";
import dotenv from "dotenv";
import fs from "fs/promises";
import type { BaseReader, Metadata } from "llamaindex";
import {withLangTraceRootSpan} from "../../utils/instrumentation";
import {
  Document,
  FILE_EXT_TO_READER,
  IngestionPipeline,
  QuestionsAnsweredExtractor,
  SimpleDirectoryReader,
  TextFileReader,
  TitleExtractor,
  VectorStoreIndex,
} from "llamaindex";
dotenv.config();

init()

export async function basic() {
  withLangTraceRootSpan(async () => {
    // Load essay from abramov.txt in Node
    const path = "node_modules/llamaindex/examples/abramov.txt";

    const essay = await fs.readFile(path, "utf-8");

    // Create Document object with essay
    const document = new Document({ text: essay, id_: path });

    // Split text and create embeddings. Store them in a VectorStoreIndex
    const index = await VectorStoreIndex.fromDocuments([document]);

    // Query the index
    const queryEngine = index.asQueryEngine();
    const response = await queryEngine.query({
      query: "What did the author do in college?",
    });

    // Output response
    console.log(response.toString());
  });
}

export async function extractor() {
  const pipeline = new IngestionPipeline({
    transformations: [
      new TitleExtractor(),
      new QuestionsAnsweredExtractor({
        questions: 5,
      }),
    ],
  });

  const nodes = await pipeline.run({
    documents: [
      new Document({ text: "I am 10 years old. John is 20 years old." }),
    ],
  });

  for (const node of nodes) {
    console.log(node.metadata);
  }
}

export async function loader() {
  class ZipReader implements BaseReader {
    loadData(...args: any[]): Promise<Document<Metadata>[]> {
      throw new Error("Implement me");
    }
  }

  const reader = new SimpleDirectoryReader();
  const documents = await reader.loadData({
    directoryPath: "src/examples/llamaindex/data",
    defaultReader: new TextFileReader(),
    fileExtToReader: {
      ...FILE_EXT_TO_READER,
      zip: new ZipReader(),
    },
  });

  documents.forEach((doc) => {
    console.log(`document (${doc.id_}):`, doc.getText());
  });
}
