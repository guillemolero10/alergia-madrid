#!/bin/sh
# Genera el PDF de la entrega a partir de diapositivas.html (necesita Google Chrome y `npm install` hecho, por las tipografías).
set -e
cd "$(dirname "$0")"
CHROME="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
"$CHROME" --headless=new --disable-gpu --no-pdf-header-footer --allow-file-access-from-files \
  --print-to-pdf="$PWD/donde-hace-falta-DATAMAD2026.pdf" "file://$PWD/diapositivas.html" 2>/dev/null
echo "PDF: $PWD/donde-hace-falta-DATAMAD2026.pdf"
