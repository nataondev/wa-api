const swaggerJsdoc = require("swagger-jsdoc");

const env = process.env.NODE_ENV || "local";
const port = process.env.APP_PORT || 3000;
const url = env === "local" ? "http://localhost:" + port : process.env.BASE_URL;
const desc = env === "local" ? "Development" : "Production";

const options = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "WhatsApp API Documentation",
      version: "1.0.0",
      description: "Dokumentasi API untuk WhatsApp API menggunakan Baileys",
      license: {
        name: "MIT",
        url: "https://spdx.org/licenses/MIT.html",
      },
      contact: {
        name: "WhatsApp API",
        url: "https://github.com/yourusername/whatsapp-api",
      },
    },
    servers: [
      {
        url,
        description: desc,
      },
    ],
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: "apiKey",
          in: "header",
          name: "x-api-key",
          description: "API Key Authentication",
        },
      },
    },
    security: [
      {
        ApiKeyAuth: [],
      },
    ],
  },
  apis: ["./src/routes/swagger/swagger-docs/*.js", "./src/routes/*.js"],
};

module.exports = swaggerJsdoc(options);
