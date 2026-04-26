#!/bin/bash
# Patch @langchain/aws to handle empty text content blocks from Nova models.
# Nova sometimes returns AI messages with {"type":"text","text":""} which causes
# "Unsupported content block type" errors in convertAIMessageToConverseMessage.
#
# This patch adds an explicit handler for empty text blocks, skipping them silently.
# Applied to both ESM (.js) and CJS (.cjs) builds.

PATCH_MARKER="Skip empty text blocks"
TARGET_DIR="node_modules/@langchain/aws/dist/utils"

for ext in js cjs; do
  FILE="$TARGET_DIR/message_inputs.$ext"
  if [ -f "$FILE" ]; then
    if grep -q "$PATCH_MARKER" "$FILE"; then
      echo "[patch] $FILE already patched, skipping"
    else
      # Insert handler for empty text blocks after the non-empty text handler
      sed -i 's/} else if (block.type === "reasoning_content")/} else if (block.type === "text" \&\& block.text === "") {\n\t\t\t\t\/\/ Skip empty text blocks — Nova models sometimes return these.\n\t\t\t} else if (block.type === "reasoning_content")/' "$FILE"
      if grep -q "$PATCH_MARKER" "$FILE" 2>/dev/null || grep -q 'block.text === ""' "$FILE"; then
        echo "[patch] Successfully patched $FILE"
      else
        echo "[patch] WARNING: Failed to patch $FILE"
      fi
    fi
  else
    echo "[patch] $FILE not found, skipping"
  fi
done
