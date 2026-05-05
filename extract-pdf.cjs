const { PDFParse } = require('./node_modules/pdf-parse/dist/pdf-parse/cjs/index.cjs');
const fs = require('fs');
const path = require('path');

const filePath = path.resolve('/Users/eshantrisal/Downloads/a6a4770-8757-01a3-bc05-87ec83704ea7_LakshmanjooAcademy_AGift.pdf');
const fileUrl = 'file://' + filePath;

const parser = new PDFParse({ url: fileUrl });
parser.getText().then(result => {
  console.log('Pages:', result.numpages);
  console.log('Text length:', result.text.length);
  console.log('---EXTRACTED TEXT---');
  console.log(result.text);
}).catch(e => {
  console.error('Error:', e.message);
  console.error(e.stack);
});
