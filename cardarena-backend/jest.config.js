/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: "ts-jest",
  testEnvironment: "node",
  roots: ["<rootDir>/src"],
  testMatch: ["**/*.test.ts"],
  setupFiles: ["dotenv/config"],
  moduleFileExtensions: ["ts", "js", "json"],
  clearMocks: true,
};
