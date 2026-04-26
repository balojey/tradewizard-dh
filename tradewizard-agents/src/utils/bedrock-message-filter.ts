/**
 * Bedrock Message Filter
 *
 * Provides utilities and a ChatBedrockConverse subclass that filters empty text
 * content blocks from AI messages before they are sent back to the Converse API.
 *
 * Nova models sometimes return AI messages with:
 * 1. Array content containing empty text blocks: [{"type":"text","text":""}]
 * 2. Empty string content: ""
 *
 * Both forms cause issues:
 * - Form 1 throws "Unsupported content block type" in @langchain/aws message conversion
 *   (fixed by postinstall patch to @langchain/aws)
 * - Form 2 causes infinite agent loops (model keeps returning empty responses with tool_calls)
 *
 * This module provides a defense-in-depth SafeChatBedrockConverse subclass that:
 * - Filters empty text blocks from array content (form 1)
 * - Replaces empty string content with a placeholder on AI messages that have tool_calls (form 2)
 */

import { ChatBedrockConverse } from '@langchain/aws';
import { AIMessage, type BaseMessage } from '@langchain/core/messages';
import type { ChatResult } from '@langchain/core/outputs';

/**
 * Filter empty text content blocks from AI messages and fix empty string content.
 *
 * Handles two forms of empty content from Nova models:
 * 1. Array content with empty text blocks: removes the empty blocks
 * 2. Empty string content "" on AI messages with tool_calls: replaces with placeholder
 *    to prevent infinite agent loops
 *
 * @param messages - Array of messages to sanitize
 * @returns Sanitized messages with empty content issues resolved
 */
export function filterEmptyContentBlocks(messages: BaseMessage[]): BaseMessage[] {
  return messages.map((msg) => {
    if (!(msg instanceof AIMessage)) {
      return msg;
    }

    // Case 1: Array content with empty text blocks
    if (Array.isArray(msg.content)) {
      const filtered = msg.content.filter((block) => {
        if (typeof block === 'object' && 'type' in block && block.type === 'text') {
          return typeof block.text === 'string' && block.text.trim().length > 0;
        }
        return true;
      });

      // If all content blocks were empty text, keep the original
      if (filtered.length === 0) {
        return msg;
      }

      // Only create a new message if we actually filtered something
      if (filtered.length !== msg.content.length) {
        return new AIMessage({
          content: filtered,
          tool_calls: msg.tool_calls,
          additional_kwargs: msg.additional_kwargs,
          response_metadata: msg.response_metadata,
          id: msg.id,
        });
      }

      return msg;
    }

    // Case 2: Empty string content on AI messages with tool_calls
    // Nova returns content="" with tool_calls. When this is fed back into the
    // Converse API, the model sees an empty assistant turn and gets confused,
    // leading to infinite tool-calling loops. Replace with a minimal placeholder.
    if (
      typeof msg.content === 'string' &&
      msg.content === '' &&
      msg.tool_calls &&
      msg.tool_calls.length > 0
    ) {
      return new AIMessage({
        content: 'Calling tools.',
        tool_calls: msg.tool_calls,
        additional_kwargs: msg.additional_kwargs,
        response_metadata: msg.response_metadata,
        id: msg.id,
      });
    }

    return msg;
  });
}

/**
 * A ChatBedrockConverse subclass that automatically sanitizes messages
 * before every LLM call, preventing empty content block errors and
 * infinite agent loops.
 *
 * Defense-in-depth layer on top of the @langchain/aws library patch.
 */
export class SafeChatBedrockConverse extends ChatBedrockConverse {
  async _generate(
    messages: BaseMessage[],
    options: this['ParsedCallOptions'],
    runManager?: any,
  ): Promise<ChatResult> {
    const sanitized = filterEmptyContentBlocks(messages);
    return super._generate(sanitized, options, runManager);
  }
}

/**
 * @deprecated Use SafeChatBedrockConverse directly instead.
 * Kept for backward compatibility.
 */
export function withEmptyBlockFilter<T extends ChatBedrockConverse>(model: T): T {
  if (model instanceof SafeChatBedrockConverse) {
    return model;
  }
  console.warn(
    '[withEmptyBlockFilter] Called on a plain ChatBedrockConverse. ' +
    'Use SafeChatBedrockConverse from the factory instead for full coverage.'
  );
  return model;
}
