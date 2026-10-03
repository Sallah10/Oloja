import { Ionicons } from "@expo/vector-icons";

export type TemplateProduct = {
  name: string;
  /** Suggested selling price in kobo (minor units). */
  priceMinor: number;
};

export type TradeTemplate = {
  id: string;
  name: string;
  blurb: string;
  icon: keyof typeof Ionicons.glyphMap;
  products: TemplateProduct[];
};

// Realistic starting points for the common market trades. Prices are
// suggestions only - the wizard lets the owner edit every one. Cost is left
// unknown (0) on purpose: the ledger then shows "no cost yet" until a restock
// records what the supplier actually charges.
export const TRADE_TEMPLATES: TradeTemplate[] = [
  {
    id: "fashion",
    name: "Fashion & clothing",
    blurb: "Fabrics, native wear and accessories",
    icon: "shirt-outline",
    products: [
      { name: "Ankara wrapper", priceMinor: 12_000_00 },
      { name: "Men's native two-piece", priceMinor: 18_000_00 },
      { name: "Ladies' blouse", priceMinor: 9_000_00 },
      { name: "Skirt & blouse set", priceMinor: 15_000_00 },
      { name: "Aso-oke fabric", priceMinor: 25_000_00 },
      { name: "Handbag", priceMinor: 7_500_00 },
      { name: "Belt", priceMinor: 3_000_00 },
    ],
  },
  {
    id: "beauty",
    name: "Beauty & cosmetics",
    blurb: "Skincare, makeup and fragrance",
    icon: "flower-outline",
    products: [
      { name: "Shea butter cream 400ml", priceMinor: 8_000_00 },
      { name: "Hair relaxer kit", priceMinor: 9_500_00 },
      { name: "Makeup set", priceMinor: 15_000_00 },
      { name: "Press-on nails", priceMinor: 4_500_00 },
      { name: "Perfume 50ml", priceMinor: 12_500_00 },
      { name: "Lipstick", priceMinor: 3_500_00 },
    ],
  },
  {
    id: "food",
    name: "Food & provisions",
    blurb: "Stew stuff, rice, oil and store-cupboard staples",
    icon: "restaurant-outline",
    products: [
      { name: "Groundnut oil 5L", priceMinor: 12_000_00 },
      { name: "Vegetable oil 1L", priceMinor: 2_800_00 },
      { name: "Rice 10kg", priceMinor: 28_000_00 },
      { name: "Spaghetti pack", priceMinor: 3_200_00 },
      { name: "Tomato tin", priceMinor: 1_800_00 },
      { name: "Milo tin", priceMinor: 7_500_00 },
      { name: "Sugar 1kg", priceMinor: 3_000_00 },
    ],
  },
  {
    id: "phone",
    name: "Phones & accessories",
    blurb: "Chargers, cables and the small tech people ask for",
    icon: "phone-portrait-outline",
    products: [
      { name: "Phone charger", priceMinor: 2_500_00 },
      { name: "Earbuds", priceMinor: 5_000_00 },
      { name: "USB cable", priceMinor: 1_500_00 },
      { name: "Phone pouch", priceMinor: 3_000_00 },
      { name: "Power bank", priceMinor: 12_000_00 },
      { name: "Screen protector", priceMinor: 2_000_00 },
    ],
  },
  {
    id: "pharmacy",
    name: "Pharmacy & drugs",
    blurb: "Everyday relief people queue up for",
    icon: "medkit-outline",
    products: [
      { name: "Paracetamol pack", priceMinor: 1_500_00 },
      { name: "Cough syrup", priceMinor: 3_500_00 },
      { name: "Malaria treatment", priceMinor: 2_800_00 },
      { name: "Multivitamin", priceMinor: 6_000_00 },
      { name: "Skin ointment", priceMinor: 2_500_00 },
      { name: "First aid kit", priceMinor: 8_000_00 },
    ],
  },
  {
    id: "mixed",
    name: "A bit of everything",
    blurb: "The neighbourhood stall that sells a little of all",
    icon: "grid-outline",
    products: [
      { name: "Eggs (crate)", priceMinor: 5_800_00 },
      { name: "Recharge card", priceMinor: 1_000_00 },
      { name: "Groundnut oil 1L", priceMinor: 2_800_00 },
      { name: "Spaghetti pack", priceMinor: 3_200_00 },
      { name: "Bar soap", priceMinor: 1_200_00 },
      { name: "Phone charger", priceMinor: 2_500_00 },
    ],
  },
];