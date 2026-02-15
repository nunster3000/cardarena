"use strict";
/* import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});*/
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.stripe = void 0;
const stripe_1 = __importDefault(require("stripe"));
let stripe;
if (process.env.NODE_ENV === "test") {
    // Mock Stripe for tests
    exports.stripe = stripe = {};
}
else {
    if (!process.env.STRIPE_SECRET_KEY) {
        throw new Error("STRIPE_SECRET_KEY is not defined");
    }
    exports.stripe = stripe = new stripe_1.default(process.env.STRIPE_SECRET_KEY);
}
