/* import Stripe from "stripe";

export const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {});*/

import Stripe from "stripe";

let stripe: Stripe;

if (process.env.NODE_ENV === "test") {
  // Mock Stripe for tests
  stripe = {} as Stripe;
} else {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY is not defined");
  }

  stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
}

export { stripe };


