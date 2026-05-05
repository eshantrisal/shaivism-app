const fs = require('fs');

const data = fs.readFileSync('/Users/eshantrisal/Downloads/a6a4770-8757-01a3-bc05-87ec83704ea7_LakshmanjooAcademy_AGift.pdf');

// JPEG starts with FF D8 FF, ends with FF D9
const start = data.indexOf(Buffer.from([0xFF, 0xD8, 0xFF]));
let end = -1;
for (let i = data.length - 2; i >= 0; i--) {
  if (data[i] === 0xFF && data[i+1] === 0xD9) {
    end = i + 2;
    break;
  }
}

if (start === -1 || end === -1) {
  console.error('No JPEG found');
  process.exit(1);
}

console.log(`JPEG found: bytes ${start} to ${end} (${end - start} bytes)`);
const jpg = data.slice(start, end);
fs.writeFileSync('/tmp/pdf-page.jpg', jpg);
console.log('Saved to /tmp/pdf-page.jpg');
