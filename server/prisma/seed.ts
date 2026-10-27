import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

// Development seed data only.
//
// Running `npm run db:seed` creates a demo owner, event, wishlist and a handful
// of sample gifts (including an air fryer) so the public wishlist can be
// previewed locally. This is idempotent: re-running it updates the same rows
// instead of duplicating them. It refuses to run against a production database.

const DEMO_EMAIL = "demo@hint-darling.test";
const DEMO_PASSWORD = "demo-password-123";
const DEMO_SHARE_TOKEN = "dev-demo-wishlist-share-token-0001";

async function main(): Promise<void> {
  if (process.env.NODE_ENV === "production") {
    console.warn("Refusing to seed a production database. Set NODE_ENV to something else.");
    return;
  }

  const passwordHash = await hashPassword(DEMO_PASSWORD);

  const owner = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    update: { name: "Emma & James", emailVerifiedAt: new Date() },
    create: {
      email: DEMO_EMAIL,
      name: "Emma & James",
      passwordHash,
      emailVerifiedAt: new Date(),
    },
  });

  const event = await prisma.event.upsert({
    where: { id: "seed-demo-event" },
    update: {},
    create: {
      id: "seed-demo-event",
      ownerId: owner.id,
      name: "Emma & James",
      type: "WEDDING",
      eventDate: new Date("2026-09-12T00:00:00.000Z"),
      location: "The Old Barn, Cotswolds",
      description:
        "We're so excited to celebrate with you. If you'd like to treat us, here are a few things we'd love.",
    },
  });

  const wishlist = await prisma.wishlist.upsert({
    where: { eventId: event.id },
    update: {
      shareToken: DEMO_SHARE_TOKEN,
      isActive: true,
      privacyMode: "LINK_ONLY",
    },
    create: {
      id: "seed-demo-wishlist",
      eventId: event.id,
      title: "Our Wedding Wishlist",
      description:
        "Thank you for helping us start our life together. Anything here would be treasured — and no gift is ever expected.",
      shareToken: DEMO_SHARE_TOKEN,
      privacyMode: "LINK_ONLY",
    },
  });

  const items = [
    {
      id: "seed-item-air-fryer",
      name: "Ninja Air Fryer Max",
      productUrl: "https://example.com/products/ninja-air-fryer-max",
      imageUrl: "https://picsum.photos/seed/air-fryer/800/600",
      price: 179.99,
      currency: "GBP",
      description: "For cosy nights in and crisping everything in sight.",
      preferredColour: "Sage green",
      preferredSize: "5.5L",
      preferredVariation: null as string | null,
      quantity: 1,
      notes: null as string | null,
      position: 0,
    },
    {
      id: "seed-item-stand-mixer",
      name: "KitchenAid Artisan Stand Mixer",
      productUrl: "https://example.com/products/kitchenaid-artisan",
      imageUrl: "https://picsum.photos/seed/stand-mixer/800/600",
      price: 449.0,
      currency: "GBP",
      description: "Cream, to match the kitchen we're dreaming of.",
      preferredColour: "Cream",
      preferredSize: "4.8L",
      preferredVariation: "Artisan 5KSM185",
      quantity: 1,
      notes: null as string | null,
      position: 1,
    },
    {
      id: "seed-item-linen-bedding",
      name: "Washed Linen Bedding Set",
      productUrl: "https://example.com/products/linen-bedding",
      imageUrl: "https://picsum.photos/seed/linen-bedding/800/600",
      price: 220.0,
      currency: "GBP",
      description: "Stonewashed, soft and endlessly cosy.",
      preferredColour: "Oatmeal",
      preferredSize: "King",
      preferredVariation: null as string | null,
      quantity: 2,
      notes: null as string | null,
      position: 2,
    },
    {
      id: "seed-item-espresso",
      name: "Sage Barista Express Espresso Machine",
      productUrl: "https://example.com/products/sage-barista-express",
      imageUrl: "https://picsum.photos/seed/espresso-machine/800/600",
      price: 629.0,
      currency: "GBP",
      description: "For slow Sunday mornings together.",
      preferredColour: "Brushed stainless steel",
      preferredSize: null as string | null,
      preferredVariation: "SES875",
      quantity: 1,
      notes: null as string | null,
      position: 3,
    },
    {
      id: "seed-item-honeymoon-fund",
      name: "Honeymoon Fund",
      productUrl: null,
      imageUrl: "https://picsum.photos/seed/honeymoon/800/600",
      price: 50.0,
      currency: "GBP",
      description: "A contribution towards our first adventure as newlyweds.",
      preferredColour: null,
      preferredSize: null,
      preferredVariation: null,
      quantity: 10,
      notes: null as string | null,
      position: 4,
    },
  ];

  for (const item of items) {
    const { id, ...data } = item;
    await prisma.wishlistItem.upsert({
      where: { id },
      update: { ...data, wishlistId: wishlist.id },
      create: { id, ...data, wishlistId: wishlist.id },
    });
  }

  console.log(
    `Seeded demo wishlist "${wishlist.title}" — view it at /w/${DEMO_SHARE_TOKEN}`,
  );
  console.log(`Demo sign-in: ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
