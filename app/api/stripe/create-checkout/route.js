import { NextResponse } from "next/server";
import { createCheckout } from "@/libs/stripe";
import { createClient } from "@/libs/supabase/server";

// This function is used to create a Stripe Checkout Session (one-time payment or subscription)
// It's called by the <ButtonCheckout /> component
// Users must be authenticated. It will prefill the Checkout data with their email and/or credit card (if any)
export async function POST(req) {
  try {
    const supabase = createClient();

    const {
      data: { user },
    } = await supabase.auth.getUser();

    // User who are not logged in can't make a purchase
    if (!user) {
      return NextResponse.json(
        { error: "You must be logged in to make a purchase." },
        { status: 401 }
      );
    }

    const body = await req.json();

    const { priceId, mode, successUrl, cancelUrl } = body;

    if (!priceId) {
      return NextResponse.json(
        { error: "Price ID is required" },
        { status: 400 }
      );
    } else if (!successUrl || !cancelUrl) {
      return NextResponse.json(
        { error: "Success and cancel URLs are required" },
        { status: 400 }
      );
    } else if (!body.mode) {
      return NextResponse.json(
        {
          error:
            "Mode is required (either 'payment' for one-time payments or 'subscription' for recurring subscription)",
        },
        { status: 400 }
      );
    }

    // Search for a profile with unique ID equals to the user session ID (in table called 'profiles')
    const { data } = await supabase
      .from("profiles")
      .select("*")
      .eq("id", user?.id)
      .single();

    // If no profile found, create one. This is used to store the Stripe customer ID
    if (!data) {
      await supabase.from("profiles").insert([
        {
          id: user?.id,
          email: user?.email,
          price_id: body.priceId,
        },
      ]);
    }

    const stripeSessionURL = await createCheckout({
      priceId,
      mode,
      successUrl,
      cancelUrl,
      clientReferenceId: user?.id,
      user: {
        email: user?.email,
        // If the user has already purchased, it will automatically prefill it's credit card
        customerId: data?.customer_id,
      },
      // If you send coupons from the frontend, you can pass it here
      // couponId: body.couponId,
    });

    return NextResponse.json({ url: stripeSessionURL });
  } catch (e) {
    console.error(e);
    return NextResponse.json({ error: e?.message }, { status: 500 });
  }
}
