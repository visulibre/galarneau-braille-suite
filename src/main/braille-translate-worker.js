const brailleService = require("./braille-service");

function serializeError(error) {
  if (error instanceof Error) {
    return {
      name: error.name,
      message: error.message,
      stack: error.stack,
    };
  }

  return {
    name: "Error",
    message: typeof error === "string" ? error : String(error),
    stack: null,
  };
}

process.on("message", (message) => {
  if (!message || typeof message !== "object" || message.type !== "translate") {
    return;
  }

  try {
    const result = brailleService.translate(message.payload);
    if (typeof process.send === "function") {
      process.send({ ok: true, result });
    }
  } catch (error) {
    if (typeof process.send === "function") {
      process.send({ ok: false, error: serializeError(error) });
    }
  }
});
