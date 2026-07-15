const alphabet = "0123456789";

function generateRoomCode(length = 6) {
  let code = "";

  for (let index = 0; index < length; index += 1) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }

  return code;
}

module.exports = { generateRoomCode };
