"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const db_1 = require("../db");
afterAll(async () => {
    await db_1.prisma.$disconnect();
});
