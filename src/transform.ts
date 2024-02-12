import MagicString from "magic-string";
import builtinGenerators from "./generators";
import { GenerateContext, GenerateResult } from "./generator";
import { Block, findBlocks, parseRawArgs } from "./_parse";
import { Config, ResolvedConfig, resolveConfig } from "./config";

export interface TransformResult {
  hasChanged: boolean;
  contents: string;
  updates: { block: Block; result: GenerateResult }[];
}

export async function transform(
  contents: string,
  _config?: Config,
): Promise<TransformResult> {
  const config = resolveConfig(_config);

  const editor = new MagicString(contents);

  const updates: TransformResult["updates"] = [];

  const generators = {
    ...builtinGenerators,
    ...config.generators,
  };

  const blocks = findBlocks(contents);

  for (const block of blocks) {
    const result = await _transformBlock(block, config, generators);
    updates.push({ block, result });
    editor.overwrite(
      block.loc.start,
      block.loc.end,
      `\n\n${result.contents}\n\n`,
    );
  }

  return {
    hasChanged: editor.hasChanged(),
    contents: editor.toString(),
    updates,
  };
}

async function _transformBlock(
  block: Block,
  config: ResolvedConfig,
  generators: Record<string, any>,
): Promise<GenerateResult> {
  const args = parseRawArgs(block.rawArgs);
  const generator = generators[block.generator];

  if (!generator) {
    const didYouMean = await import("didyoumean2").then((r) => r.default || r);
    const suggestions = didYouMean(block.generator, Object.keys(generators));
    const warn = `[automd] Unknown generator:\`${block.generator}\`.${suggestions ? ` Did you mean "generator:\`${suggestions}\`"?` : ""}`;
    return {
      contents: `/* ${warn} */`,
      warnings: [warn],
    };
  }

  const context: GenerateContext = {
    args,
    config,
    block,
  };

  const result = (await generator.generate(context)) as GenerateResult;

  return result;
}
