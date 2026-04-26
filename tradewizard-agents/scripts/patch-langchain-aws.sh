#!/bin/sh
# Patch @langchain/aws to handle empty text content blocks from Nova models.
# Nova sometimes returns AI messages with {"type":"text","text":""} which causes
# "Unsupported content block type" errors in convertAIMessageToConverseMessage.
#
# This patch adds an explicit handler for empty text blocks, skipping them silently.
# Applied to both ESM (.js) and CJS (.cjs) builds.
#
# Uses /bin/sh for Alpine Linux (ash) compatibility.

TARGET_DIR="node_modules/@langchain/aws/dist/utils"

for ext in js cjs; do
  FILE="$TARGET_DIR/message_inputs.$ext"
  if [ -f "$FILE" ]; then
    if grep -q 'block.text === ""' "$FILE"; then
      echo "[patch] $FILE already patched, skipping"
    else
      # Use node to apply the patch reliably across platforms
      node -e "
        const fs = require('fs');
        const file = '$FILE';
        let content = fs.readFileSync(file, 'utf8');
        const target = '} else if (block.type === \"reasoning_content\")';
        const replacement = '} else if (block.type === \"text\" && block.text === \"\") {\\n\\t\\t\\t\\t// Skip empty text blocks - Nova models sometimes return these.\\n\\t\\t\\t} else if (block.type === \"reasoning_content\")';
        if (content.includes(target)) {
          content = content.replace(target, replacement);
          fs.writeFileSync(file, content, 'utf8');
          console.log('[patch] Successfully patched ' + file);
        } else {
          console.log('[patch] WARNING: Target pattern not found in ' + file);
        }
      "
    fi
  else
    echo "[patch] $FILE not found, skipping"
  fi
done
