import type { FoodType, StockUnit } from "../../src/generated/prisma/enums";
import { IMG } from "./images";

export interface MenuItemSeed {
  sku: string;
  name: string;
  category: string;
  price: number; // major units (₹)
  foodType: FoodType;
  image?: string;
  description?: string;
  station?: string;
  prep?: number;
  bestseller?: boolean;
  featured?: boolean;
  spicy?: boolean;
  variants?: [name: string, price: number][];
  modifiers?: string[];
  /** [ingredientSku, quantity, unit] per portion. */
  recipe?: [string, number, StockUnit][];
  combo?: [sku: string, qty: number][];
  /** Relative popularity used by the order generator. */
  weight: number;
  /** Role in a typical order. */
  role: "starter" | "main" | "curry" | "bread" | "rice" | "drink" | "dessert" | "side" | "combo" | "snack";
}

export interface IngredientSeed {
  sku: string;
  name: string;
  category: string;
  unit: StockUnit;
  cost: number; // ₹ per unit
  stock: number;
  min: number;
  max?: number;
  supplier: string;
  storage: string;
  expiresInDays?: number;
}

export interface SupplierSeed {
  key: string;
  name: string;
  contactPerson: string;
  phone: string;
  email: string;
  paymentTerms: string;
  gstNumber?: string;
  address: string;
}

export interface ModifierGroupSeed {
  name: string;
  min: number;
  max: number;
  options: [name: string, price: number][];
}

// ════════════════════════════ Spice & Stone ═════════════════════════════════

export const SPICE_SUPPLIERS: SupplierSeed[] = [
  { key: "veg", name: "Green Basket Produce", contactPerson: "Manjunath Gowda", phone: "9845012345", email: "orders@greenbasket.demo", paymentTerms: "Weekly", address: "KR Market, Bengaluru", gstNumber: "29AAGCG1234K1Z2" },
  { key: "dairy", name: "Kaveri Dairy Co.", contactPerson: "Lakshmi Prasad", phone: "9880023456", email: "supply@kaveridairy.demo", paymentTerms: "Net 7", address: "Hosur Road, Bengaluru", gstNumber: "29AAFCK5678L1Z9" },
  { key: "meat", name: "Royal Meat & Poultry", contactPerson: "Imran Pasha", phone: "9741134567", email: "royalmeat@demo.in", paymentTerms: "Cash on delivery", address: "Shivajinagar, Bengaluru" },
  { key: "dry", name: "Spice Route Traders", contactPerson: "Ramesh Jain", phone: "9900145678", email: "sales@spiceroute.demo", paymentTerms: "Net 15", address: "Chickpet, Bengaluru", gstNumber: "29AABFS9012M1Z4" },
  { key: "whole", name: "Bharat Wholesale Mart", contactPerson: "Sanjay Kulkarni", phone: "9886256789", email: "b2b@bharatwholesale.demo", paymentTerms: "Net 30", address: "Yeshwanthpur, Bengaluru", gstNumber: "29AACCB3456N1Z7" },
  { key: "pack", name: "PackRight Packaging", contactPerson: "Farhan Ali", phone: "9591367890", email: "hello@packright.demo", paymentTerms: "Net 30", address: "Peenya Industrial Area, Bengaluru" },
];

export const SPICE_INGREDIENTS: IngredientSeed[] = [
  { sku: "ING-CHK", name: "Chicken (boneless)", category: "Meat & Poultry", unit: "KG", cost: 280, stock: 18.5, min: 8, max: 40, supplier: "meat", storage: "Cold room", expiresInDays: 3 },
  { sku: "ING-CHB", name: "Chicken (curry cut)", category: "Meat & Poultry", unit: "KG", cost: 220, stock: 14, min: 6, max: 30, supplier: "meat", storage: "Cold room", expiresInDays: 3 },
  { sku: "ING-MUT", name: "Mutton", category: "Meat & Poultry", unit: "KG", cost: 720, stock: 6.2, min: 3, max: 12, supplier: "meat", storage: "Cold room", expiresInDays: 4 },
  { sku: "ING-FSH", name: "Basa fish fillet", category: "Seafood", unit: "KG", cost: 380, stock: 2.4, min: 3, max: 10, supplier: "meat", storage: "Freezer" },
  { sku: "ING-PNR", name: "Paneer", category: "Dairy", unit: "KG", cost: 360, stock: 9.5, min: 5, max: 20, supplier: "dairy", storage: "Cold room", expiresInDays: 2 },
  { sku: "ING-BUT", name: "Butter", category: "Dairy", unit: "KG", cost: 520, stock: 6, min: 3, max: 12, supplier: "dairy", storage: "Cold room", expiresInDays: 40 },
  { sku: "ING-CRM", name: "Fresh cream", category: "Dairy", unit: "LTR", cost: 220, stock: 5, min: 3, max: 10, supplier: "dairy", storage: "Cold room", expiresInDays: 3 },
  { sku: "ING-CRD", name: "Curd", category: "Dairy", unit: "LTR", cost: 70, stock: 11, min: 5, max: 20, supplier: "dairy", storage: "Cold room", expiresInDays: 4 },
  { sku: "ING-MLK", name: "Full cream milk", category: "Dairy", unit: "LTR", cost: 62, stock: 22, min: 10, max: 40, supplier: "dairy", storage: "Cold room", expiresInDays: 2 },
  { sku: "ING-CHS", name: "Cheese slices", category: "Dairy", unit: "PCS", cost: 9, stock: 140, min: 60, max: 300, supplier: "dairy", storage: "Cold room", expiresInDays: 25 },
  { sku: "ING-MOZ", name: "Mozzarella", category: "Dairy", unit: "KG", cost: 480, stock: 3.5, min: 2, max: 8, supplier: "dairy", storage: "Cold room", expiresInDays: 8 },
  { sku: "ING-TOM", name: "Tomato", category: "Vegetables", unit: "KG", cost: 38, stock: 25, min: 10, max: 50, supplier: "veg", storage: "Vegetable rack", expiresInDays: 5 },
  { sku: "ING-ONI", name: "Onion", category: "Vegetables", unit: "KG", cost: 32, stock: 30, min: 15, max: 60, supplier: "veg", storage: "Dry store" },
  { sku: "ING-GGP", name: "Ginger-garlic paste", category: "Spices & Masala", unit: "KG", cost: 160, stock: 3, min: 2, max: 6, supplier: "dry", storage: "Cold room", expiresInDays: 12 },
  { sku: "ING-CAP", name: "Capsicum", category: "Vegetables", unit: "KG", cost: 80, stock: 4, min: 2, max: 10, supplier: "veg", storage: "Vegetable rack", expiresInDays: 5 },
  { sku: "ING-LET", name: "Iceberg lettuce", category: "Vegetables", unit: "KG", cost: 140, stock: 0.9, min: 1, max: 4, supplier: "veg", storage: "Cold room", expiresInDays: 1 },
  { sku: "ING-POT", name: "Potato", category: "Vegetables", unit: "KG", cost: 28, stock: 35, min: 15, max: 60, supplier: "veg", storage: "Dry store" },
  { sku: "ING-FRZ", name: "Frozen fries", category: "Vegetables", unit: "KG", cost: 180, stock: 7, min: 5, max: 20, supplier: "whole", storage: "Freezer" },
  { sku: "ING-SPN", name: "Spinach", category: "Vegetables", unit: "KG", cost: 60, stock: 1.6, min: 3, max: 8, supplier: "veg", storage: "Cold room", expiresInDays: 2 },
  { sku: "ING-BAS", name: "Basmati rice", category: "Grains & Flour", unit: "KG", cost: 115, stock: 40, min: 20, max: 80, supplier: "whole", storage: "Dry store" },
  { sku: "ING-ATA", name: "Wheat flour (atta)", category: "Grains & Flour", unit: "KG", cost: 42, stock: 30, min: 15, max: 60, supplier: "whole", storage: "Dry store" },
  { sku: "ING-MAI", name: "Refined flour (maida)", category: "Grains & Flour", unit: "KG", cost: 38, stock: 18, min: 10, max: 40, supplier: "whole", storage: "Dry store" },
  { sku: "ING-DAL", name: "Black urad dal", category: "Grains & Flour", unit: "KG", cost: 140, stock: 12, min: 5, max: 25, supplier: "dry", storage: "Dry store" },
  { sku: "ING-RAJ", name: "Rajma", category: "Grains & Flour", unit: "KG", cost: 130, stock: 0, min: 3, max: 10, supplier: "dry", storage: "Dry store" },
  { sku: "ING-OIL", name: "Refined sunflower oil", category: "Oils & Sauces", unit: "LTR", cost: 150, stock: 30, min: 15, max: 60, supplier: "whole", storage: "Dry store" },
  { sku: "ING-GHE", name: "Ghee", category: "Oils & Sauces", unit: "KG", cost: 620, stock: 4, min: 2, max: 8, supplier: "dairy", storage: "Dry store" },
  { sku: "ING-GRM", name: "Garam masala", category: "Spices & Masala", unit: "KG", cost: 900, stock: 1.5, min: 0.5, max: 3, supplier: "dry", storage: "Spice shelf" },
  { sku: "ING-KCP", name: "Kashmiri chilli powder", category: "Spices & Masala", unit: "KG", cost: 600, stock: 0.35, min: 0.5, max: 2, supplier: "dry", storage: "Spice shelf" },
  { sku: "ING-SUG", name: "Sugar", category: "Grains & Flour", unit: "KG", cost: 44, stock: 15, min: 5, max: 30, supplier: "whole", storage: "Dry store" },
  { sku: "ING-COF", name: "Coffee powder", category: "Beverages", unit: "KG", cost: 950, stock: 1.6, min: 1, max: 4, supplier: "dry", storage: "Bar shelf" },
  { sku: "ING-TEA", name: "Assam tea leaves", category: "Beverages", unit: "KG", cost: 420, stock: 2, min: 1, max: 4, supplier: "dry", storage: "Bar shelf" },
  { sku: "ING-LEM", name: "Lemon", category: "Fruits", unit: "PCS", cost: 4, stock: 120, min: 50, max: 250, supplier: "veg", storage: "Bar fridge", expiresInDays: 7 },
  { sku: "ING-MNT", name: "Mint leaves", category: "Vegetables", unit: "KG", cost: 120, stock: 0.8, min: 0.5, max: 2, supplier: "veg", storage: "Bar fridge", expiresInDays: 2 },
  { sku: "ING-SDA", name: "Soda bottles (300 ml)", category: "Beverages", unit: "PCS", cost: 20, stock: 96, min: 48, max: 200, supplier: "whole", storage: "Bar store" },
  { sku: "ING-MNG", name: "Alphonso mango pulp", category: "Fruits", unit: "LTR", cost: 180, stock: 6, min: 3, max: 12, supplier: "whole", storage: "Bar store", expiresInDays: 60 },
  { sku: "ING-BUN", name: "Burger buns", category: "Bakery", unit: "PCS", cost: 12, stock: 60, min: 30, max: 120, supplier: "whole", storage: "Bakery rack", expiresInDays: 3 },
  { sku: "ING-PZB", name: "Pizza base (10 inch)", category: "Bakery", unit: "PCS", cost: 35, stock: 26, min: 15, max: 50, supplier: "whole", storage: "Freezer", expiresInDays: 20 },
  { sku: "ING-PEN", name: "Penne pasta", category: "Grains & Flour", unit: "KG", cost: 220, stock: 5, min: 2, max: 10, supplier: "whole", storage: "Dry store" },
  { sku: "ING-SAU", name: "Burger sauce", category: "Oils & Sauces", unit: "KG", cost: 260, stock: 2.2, min: 1, max: 5, supplier: "whole", storage: "Cold room", expiresInDays: 30 },
  { sku: "ING-KHO", name: "Khoya", category: "Dairy", unit: "KG", cost: 380, stock: 2, min: 1, max: 5, supplier: "dairy", storage: "Cold room", expiresInDays: 5 },
  { sku: "ING-CAK", name: "Chocolate cake slice", category: "Bakery", unit: "PCS", cost: 70, stock: 18, min: 10, max: 40, supplier: "whole", storage: "Dessert chiller", expiresInDays: 3 },
  { sku: "ING-ICE", name: "Vanilla ice cream", category: "Dairy", unit: "LTR", cost: 260, stock: 6, min: 4, max: 15, supplier: "dairy", storage: "Freezer", expiresInDays: 90 },
  { sku: "ING-DOS", name: "Dosa batter", category: "Grains & Flour", unit: "KG", cost: 60, stock: 8, min: 5, max: 15, supplier: "veg", storage: "Cold room", expiresInDays: 2 },
  { sku: "ING-GBL", name: "Garlic bread loaf", category: "Bakery", unit: "PCS", cost: 45, stock: 14, min: 8, max: 30, supplier: "whole", storage: "Bakery rack", expiresInDays: 4 },
  { sku: "ING-BOX", name: "Takeaway containers (500 ml)", category: "Packaging", unit: "PCS", cost: 6, stock: 420, min: 200, max: 1000, supplier: "pack", storage: "Packaging store" },
  { sku: "ING-BAG", name: "Paper carry bags", category: "Packaging", unit: "PACK", cost: 180, stock: 6, min: 4, max: 15, supplier: "pack", storage: "Packaging store" },
];

export const SPICE_MODIFIERS: ModifierGroupSeed[] = [
  { name: "Spice level", min: 0, max: 1, options: [["Mild", 0], ["Medium", 0], ["Extra hot", 0]] },
  { name: "Add-ons", min: 0, max: 3, options: [["Extra cheese", 40], ["Extra butter", 30], ["Extra paneer", 60]] },
  { name: "Milk choice", min: 0, max: 1, options: [["Regular milk", 0], ["Oat milk", 50]] },
];

const S = "Main Kitchen";
const T = "Tandoor";
const B = "Bar";
const D = "Desserts";

export const SPICE_MENU: MenuItemSeed[] = [
  // Starters
  { sku: "ST-PNT", name: "Paneer Tikka", category: "Starters", price: 329, foodType: "VEG", image: IMG.paneerTikka, station: T, prep: 18, bestseller: true, featured: true, description: "Cottage cheese cubes marinated in hung curd and Kashmiri chilli, chargrilled in the tandoor.", modifiers: ["Spice level"], recipe: [["ING-PNR", 180, "G"], ["ING-CRD", 60, "ML"], ["ING-CAP", 50, "G"], ["ING-ONI", 50, "G"], ["ING-KCP", 5, "G"], ["ING-OIL", 15, "ML"]], weight: 8, role: "starter" },
  { sku: "ST-C65", name: "Chicken 65", category: "Starters", price: 349, foodType: "NON_VEG", image: IMG.chicken65, station: S, prep: 15, spicy: true, description: "Crisp-fried chicken tossed with curry leaves and red chillies.", modifiers: ["Spice level"], recipe: [["ING-CHK", 200, "G"], ["ING-OIL", 40, "ML"], ["ING-KCP", 8, "G"], ["ING-GGP", 15, "G"]], weight: 5, role: "starter" },
  { sku: "ST-SAM", name: "Punjabi Samosa (2 pcs)", category: "Starters", price: 129, foodType: "VEG", image: IMG.samosa, station: S, prep: 8, description: "Crisp pastry stuffed with spiced potato and peas, tamarind chutney.", recipe: [["ING-MAI", 60, "G"], ["ING-POT", 120, "G"], ["ING-OIL", 40, "ML"]], weight: 2, role: "starter" },
  { sku: "ST-TDC", name: "Tandoori Chicken", category: "Starters", price: 399, foodType: "NON_VEG", image: IMG.tandoori, station: T, prep: 25, bestseller: true, spicy: true, description: "Bone-in chicken marinated overnight, roasted in the clay oven.", variants: [["Half", 399], ["Full", 699]], recipe: [["ING-CHB", 450, "G"], ["ING-CRD", 80, "ML"], ["ING-KCP", 10, "G"], ["ING-OIL", 15, "ML"]], weight: 5, role: "starter" },
  { sku: "ST-VSR", name: "Veg Spring Rolls", category: "Starters", price: 229, foodType: "VEG", image: IMG.springRolls, station: S, prep: 12, description: "Crisp rolls filled with stir-fried vegetables, sweet chilli dip.", recipe: [["ING-MAI", 60, "G"], ["ING-CAP", 40, "G"], ["ING-ONI", 40, "G"], ["ING-OIL", 40, "ML"]], weight: 2, role: "starter" },
  { sku: "ST-MOM", name: "Veg Momos", category: "Starters", price: 219, foodType: "VEG", image: IMG.momos, station: S, prep: 14, description: "Steamed dumplings with cabbage, carrot and spring onion; fiery red chutney.", recipe: [["ING-MAI", 80, "G"], ["ING-CAP", 40, "G"], ["ING-ONI", 40, "G"], ["ING-OIL", 10, "ML"]], weight: 3, role: "starter" },
  { sku: "ST-FAM", name: "Fish Amritsari", category: "Starters", price: 429, foodType: "NON_VEG", image: IMG.fishFry, station: S, prep: 16, description: "Gram-flour battered basa with ajwain and chaat masala.", recipe: [["ING-FSH", 200, "G"], ["ING-OIL", 50, "ML"], ["ING-MAI", 30, "G"]], weight: 2, role: "starter" },
  { sku: "ST-CSL", name: "Caesar Salad", category: "Starters", price: 249, foodType: "VEG", image: IMG.caesarSalad, station: S, prep: 8, description: "Crisp lettuce, parmesan-style dressing, garlic croutons.", recipe: [["ING-LET", 150, "G"], ["ING-MOZ", 20, "G"], ["ING-OIL", 10, "ML"]], weight: 1.5, role: "starter" },
  // Main course
  { sku: "MC-BTC", name: "Butter Chicken", category: "Main Course", price: 449, foodType: "NON_VEG", image: IMG.butterChicken, station: S, prep: 20, bestseller: true, featured: true, description: "Tandoori chicken simmered in a velvety tomato-butter gravy.", modifiers: ["Spice level", "Add-ons"], recipe: [["ING-CHK", 200, "G"], ["ING-BUT", 30, "G"], ["ING-CRM", 40, "ML"], ["ING-TOM", 150, "G"], ["ING-GGP", 15, "G"], ["ING-KCP", 5, "G"], ["ING-GRM", 3, "G"]], weight: 10, role: "curry" },
  { sku: "MC-PBM", name: "Paneer Butter Masala", category: "Main Course", price: 379, foodType: "VEG", image: IMG.curry, station: S, prep: 18, description: "Paneer in a rich tomato, cashew and butter gravy.", modifiers: ["Spice level", "Add-ons"], recipe: [["ING-PNR", 160, "G"], ["ING-BUT", 25, "G"], ["ING-CRM", 30, "ML"], ["ING-TOM", 150, "G"], ["ING-GGP", 10, "G"]], weight: 7, role: "curry" },
  { sku: "MC-DLM", name: "Dal Makhani", category: "Main Course", price: 299, foodType: "VEG", image: IMG.dalMakhani, station: S, prep: 12, bestseller: true, description: "Black lentils slow-cooked overnight with butter and cream.", recipe: [["ING-DAL", 90, "G"], ["ING-BUT", 25, "G"], ["ING-CRM", 30, "ML"], ["ING-TOM", 60, "G"], ["ING-GGP", 10, "G"]], weight: 8, role: "curry" },
  { sku: "MC-KDC", name: "Kadai Chicken", category: "Main Course", price: 429, foodType: "NON_VEG", image: IMG.chickenCurry, station: S, prep: 20, spicy: true, description: "Chicken tossed with capsicum, onion and freshly pounded kadai masala.", modifiers: ["Spice level"], recipe: [["ING-CHK", 200, "G"], ["ING-CAP", 60, "G"], ["ING-TOM", 100, "G"], ["ING-ONI", 80, "G"], ["ING-OIL", 25, "ML"]], weight: 4, role: "curry" },
  { sku: "MC-PLP", name: "Palak Paneer", category: "Main Course", price: 349, foodType: "VEG", image: IMG.palakPaneer, station: S, prep: 16, description: "Paneer in a garlicky spinach purée.", recipe: [["ING-PNR", 150, "G"], ["ING-SPN", 200, "G"], ["ING-CRM", 20, "ML"], ["ING-BUT", 15, "G"]], weight: 4, role: "curry" },
  { sku: "MC-MRJ", name: "Mutton Rogan Josh", category: "Main Course", price: 549, foodType: "NON_VEG", image: IMG.mutton, station: S, prep: 25, spicy: true, description: "Kashmiri-style slow-braised mutton with whole spices.", recipe: [["ING-MUT", 220, "G"], ["ING-CRD", 60, "ML"], ["ING-ONI", 80, "G"], ["ING-GHE", 25, "G"], ["ING-KCP", 8, "G"]], weight: 3, role: "curry" },
  { sku: "MC-GRC", name: "Grilled Chicken", category: "Main Course", price: 499, foodType: "NON_VEG", image: IMG.grilledChicken, station: S, prep: 22, description: "Herb-marinated chicken breast, garlic butter, sautéed greens.", recipe: [["ING-CHK", 250, "G"], ["ING-BUT", 20, "G"], ["ING-LET", 40, "G"]], weight: 2, role: "main" },
  { sku: "MC-MPZ", name: "Margherita Pizza", category: "Main Course", price: 399, foodType: "VEG", image: IMG.pizza, station: S, prep: 15, description: "Hand-stretched base, San Marzano-style tomato sauce, mozzarella, basil.", modifiers: ["Add-ons"], recipe: [["ING-PZB", 1, "PCS"], ["ING-MOZ", 120, "G"], ["ING-TOM", 80, "G"]], weight: 4, role: "main" },
  { sku: "MC-CPA", name: "Chicken Pasta", category: "Main Course", price: 349, foodType: "NON_VEG", image: IMG.pasta, station: S, prep: 15, description: "Penne in a creamy alfredo sauce with grilled chicken.", recipe: [["ING-PEN", 150, "G"], ["ING-CHK", 100, "G"], ["ING-CRM", 60, "ML"], ["ING-MOZ", 30, "G"]], weight: 3, role: "main" },
  { sku: "MC-CBG", name: "Chicken Burger", category: "Main Course", price: 249, foodType: "NON_VEG", image: IMG.burger, station: S, prep: 12, description: "Crumb-fried chicken thigh, cheese, lettuce and house burger sauce.", modifiers: ["Add-ons"], recipe: [["ING-BUN", 1, "PCS"], ["ING-CHK", 150, "G"], ["ING-CHS", 1, "PCS"], ["ING-SAU", 20, "G"], ["ING-LET", 30, "G"]], weight: 4, role: "main" },
  { sku: "MC-VBG", name: "Veg Burger", category: "Main Course", price: 199, foodType: "VEG", image: IMG.vegBurger, station: S, prep: 10, description: "Spiced potato and pea patty, cheese, lettuce, burger sauce.", modifiers: ["Add-ons"], recipe: [["ING-BUN", 1, "PCS"], ["ING-POT", 120, "G"], ["ING-CHS", 1, "PCS"], ["ING-SAU", 20, "G"], ["ING-LET", 30, "G"]], weight: 3, role: "main" },
  { sku: "MC-MSD", name: "Masala Dosa", category: "Main Course", price: 179, foodType: "VEG", image: IMG.masalaDosa, station: S, prep: 10, description: "Crisp rice crêpe with potato masala, sambar and coconut chutney.", recipe: [["ING-DOS", 180, "G"], ["ING-POT", 120, "G"], ["ING-OIL", 15, "ML"], ["ING-ONI", 40, "G"]], weight: 4, role: "main" },
  // Breads
  { sku: "BR-BNN", name: "Butter Naan", category: "Breads", price: 69, foodType: "VEG", image: IMG.butterNaan, station: T, prep: 6, description: "Soft leavened bread from the tandoor, brushed with butter.", recipe: [["ING-MAI", 90, "G"], ["ING-BUT", 10, "G"], ["ING-CRD", 20, "ML"]], weight: 14, role: "bread" },
  { sku: "BR-GNN", name: "Garlic Naan", category: "Breads", price: 89, foodType: "VEG", image: IMG.garlicNaan, station: T, prep: 6, description: "Naan topped with chopped garlic and coriander.", recipe: [["ING-MAI", 90, "G"], ["ING-BUT", 12, "G"], ["ING-GGP", 8, "G"]], weight: 9, role: "bread" },
  { sku: "BR-TRT", name: "Tandoori Roti", category: "Breads", price: 39, foodType: "VEG", image: IMG.roti, station: T, prep: 5, description: "Whole-wheat flatbread from the clay oven.", recipe: [["ING-ATA", 80, "G"]], weight: 6, role: "bread" },
  { sku: "BR-LCP", name: "Lachha Paratha", category: "Breads", price: 79, foodType: "VEG", image: IMG.paratha, station: T, prep: 7, description: "Flaky, layered whole-wheat paratha.", recipe: [["ING-ATA", 100, "G"], ["ING-GHE", 15, "G"]], weight: 4, role: "bread" },
  // Rice & Biryani
  { sku: "RB-CBR", name: "Chicken Biryani", category: "Rice & Biryani", price: 399, foodType: "NON_VEG", image: IMG.biryani, station: S, prep: 20, bestseller: true, featured: true, description: "Dum-cooked basmati layered with spiced chicken, fried onions and saffron.", variants: [["Regular", 399], ["Family pack", 749]], recipe: [["ING-BAS", 180, "G"], ["ING-CHB", 220, "G"], ["ING-CRD", 50, "ML"], ["ING-ONI", 80, "G"], ["ING-GHE", 20, "G"], ["ING-GRM", 4, "G"]], weight: 10, role: "rice" },
  { sku: "RB-VBR", name: "Veg Biryani", category: "Rice & Biryani", price: 329, foodType: "VEG", image: IMG.friedRice, station: S, prep: 18, description: "Fragrant basmati with seasonal vegetables and whole spices.", recipe: [["ING-BAS", 180, "G"], ["ING-POT", 60, "G"], ["ING-CAP", 40, "G"], ["ING-ONI", 60, "G"], ["ING-GHE", 20, "G"], ["ING-CRD", 40, "ML"]], weight: 4, role: "rice" },
  { sku: "RB-JRC", name: "Jeera Rice", category: "Rice & Biryani", price: 179, foodType: "VEG", image: IMG.cuminRice, station: S, prep: 8, description: "Basmati tempered with cumin and ghee.", recipe: [["ING-BAS", 150, "G"], ["ING-GHE", 10, "G"]], weight: 5, role: "rice" },
  // Beverages
  { sku: "BV-CCF", name: "Cold Coffee", category: "Beverages", price: 179, foodType: "VEG", image: IMG.coldCoffee, station: B, prep: 4, bestseller: true, description: "Blended with vanilla ice cream.", variants: [["Regular", 179], ["Large", 219]], modifiers: ["Milk choice"], recipe: [["ING-MLK", 250, "ML"], ["ING-COF", 8, "G"], ["ING-SUG", 25, "G"], ["ING-ICE", 40, "ML"]], weight: 6, role: "drink" },
  { sku: "BV-MCH", name: "Masala Chai", category: "Beverages", price: 79, foodType: "VEG", image: IMG.chai, station: B, prep: 5, description: "Assam tea brewed with ginger, cardamom and milk.", recipe: [["ING-MLK", 120, "ML"], ["ING-TEA", 5, "G"], ["ING-SUG", 12, "G"]], weight: 5, role: "drink" },
  { sku: "BV-FLS", name: "Fresh Lime Soda", category: "Beverages", price: 99, foodType: "VEG", image: IMG.limeSoda, station: B, prep: 3, description: "Sweet, salted or mixed.", recipe: [["ING-LEM", 1, "PCS"], ["ING-SDA", 1, "PCS"], ["ING-SUG", 20, "G"]], weight: 5, role: "drink" },
  { sku: "BV-MLS", name: "Mango Lassi", category: "Beverages", price: 149, foodType: "VEG", image: IMG.mangoSmoothie, station: B, prep: 4, description: "Thick yoghurt shake with Alphonso mango.", recipe: [["ING-CRD", 200, "ML"], ["ING-MNG", 80, "ML"], ["ING-SUG", 20, "G"]], weight: 4, role: "drink" },
  { sku: "BV-LMN", name: "Lemonade", category: "Beverages", price: 129, foodType: "VEG", image: IMG.lemonade, station: B, prep: 3, description: "Freshly squeezed lemons with mint.", recipe: [["ING-LEM", 2, "PCS"], ["ING-SUG", 30, "G"], ["ING-MNT", 5, "G"]], weight: 3, role: "drink" },
  { sku: "BV-VMJ", name: "Virgin Mojito", category: "Beverages", price: 189, foodType: "VEG", image: IMG.mojito, station: B, prep: 4, description: "Muddled mint and lime, topped with soda.", recipe: [["ING-LEM", 1, "PCS"], ["ING-MNT", 10, "G"], ["ING-SDA", 1, "PCS"], ["ING-SUG", 25, "G"]], weight: 3, role: "drink" },
  // Desserts
  { sku: "DS-GJM", name: "Gulab Jamun", category: "Desserts", price: 129, foodType: "VEG", image: IMG.gulabJamun, station: D, prep: 3, description: "Two warm khoya dumplings in cardamom syrup.", recipe: [["ING-KHO", 60, "G"], ["ING-SUG", 50, "G"], ["ING-GHE", 10, "G"]], weight: 5, role: "dessert" },
  { sku: "DS-CCK", name: "Chocolate Cake", category: "Desserts", price: 199, foodType: "EGG", image: IMG.chocolateCake, station: D, prep: 2, description: "Dark chocolate sponge with ganache.", recipe: [["ING-CAK", 1, "PCS"]], weight: 3, role: "dessert" },
  { sku: "DS-ICR", name: "Ice Cream Sundae", category: "Desserts", price: 149, foodType: "VEG", image: IMG.iceCream, station: D, prep: 3, description: "Two scoops of vanilla with chocolate sauce and nuts.", recipe: [["ING-ICE", 120, "ML"]], weight: 3, role: "dessert" },
  { sku: "DS-KLF", name: "Malai Kulfi", category: "Desserts", price: 119, foodType: "VEG", image: IMG.kulfi, station: D, prep: 2, description: "Slow-reduced milk frozen with pistachio.", recipe: [["ING-MLK", 150, "ML"], ["ING-SUG", 20, "G"]], weight: 2, role: "dessert" },
  // Sides
  { sku: "SD-FRF", name: "French Fries", category: "Sides", price: 149, foodType: "VEG", image: IMG.fries, station: S, prep: 7, description: "Salted fries with peri-peri dust.", recipe: [["ING-FRZ", 180, "G"], ["ING-OIL", 30, "ML"]], weight: 5, role: "side" },
  { sku: "SD-GBR", name: "Garlic Bread", category: "Sides", price: 169, foodType: "VEG", image: IMG.garlicBread, station: S, prep: 8, description: "Toasted with garlic butter and mozzarella.", recipe: [["ING-GBL", 1, "PCS"], ["ING-BUT", 15, "G"], ["ING-MOZ", 30, "G"]], weight: 3, role: "side" },
  { sku: "SD-RTA", name: "Cucumber Raita", category: "Sides", price: 79, foodType: "VEG", image: IMG.cucumberRaita, station: S, prep: 3, description: "Whisked curd with cucumber, mint and roasted cumin.", recipe: [["ING-CRD", 150, "ML"], ["ING-ONI", 20, "G"]], weight: 4, role: "side" },
  { sku: "SD-GSL", name: "Green Salad", category: "Sides", price: 99, foodType: "VEG", image: IMG.salad, station: S, prep: 4, description: "Onion, tomato, cucumber and lemon.", recipe: [["ING-ONI", 60, "G"], ["ING-TOM", 60, "G"], ["ING-LEM", 1, "PCS"]], weight: 2, role: "side" },
  // Combos
  { sku: "CB-THL", name: "Executive Veg Thali", category: "Combos", price: 449, foodType: "VEG", image: IMG.vegThali, station: S, prep: 15, featured: true, description: "Dal makhani, jeera rice, butter naan and gulab jamun.", combo: [["MC-DLM", 1], ["RB-JRC", 1], ["BR-BNN", 1], ["DS-GJM", 1]], weight: 4, role: "combo" },
  { sku: "CB-BGM", name: "Burger Meal", category: "Combos", price: 399, foodType: "NON_VEG", image: IMG.burger, station: S, prep: 12, description: "Chicken burger, fries and lemonade.", combo: [["MC-CBG", 1], ["SD-FRF", 1], ["BV-LMN", 1]], weight: 3, role: "combo" },
];

// ════════════════════════════ The Brew Room ═════════════════════════════════

export const BREW_SUPPLIERS: SupplierSeed[] = [
  { key: "beans", name: "Western Ghats Coffee Roasters", contactPerson: "Anita Shetty", phone: "9822011223", email: "wholesale@wgcoffee.demo", paymentTerms: "Net 15", address: "Baner, Pune" },
  { key: "dairy", name: "Sahyadri Milk Supply", contactPerson: "Ganesh Patil", phone: "9823344556", email: "orders@sahyadrimilk.demo", paymentTerms: "Weekly", address: "Hadapsar, Pune" },
  { key: "bakery", name: "Koregaon Artisan Bakers", contactPerson: "Meher Irani", phone: "9850077889", email: "hello@kpbakers.demo", paymentTerms: "Net 7", address: "Koregaon Park, Pune" },
];

export const BREW_INGREDIENTS: IngredientSeed[] = [
  { sku: "BR-ESP", name: "Espresso beans", category: "Beverages", unit: "KG", cost: 1400, stock: 4.2, min: 2, max: 10, supplier: "beans", storage: "Bar shelf" },
  { sku: "BR-MLK", name: "Toned milk", category: "Dairy", unit: "LTR", cost: 58, stock: 28, min: 15, max: 50, supplier: "dairy", storage: "Bar fridge", expiresInDays: 2 },
  { sku: "BR-OAT", name: "Oat milk", category: "Dairy", unit: "LTR", cost: 290, stock: 3, min: 2, max: 8, supplier: "dairy", storage: "Bar fridge", expiresInDays: 20 },
  { sku: "BR-CHO", name: "Cocoa powder", category: "Beverages", unit: "KG", cost: 850, stock: 0.6, min: 0.5, max: 2, supplier: "beans", storage: "Bar shelf" },
  { sku: "BR-SUG", name: "Sugar", category: "Grains & Flour", unit: "KG", cost: 44, stock: 8, min: 3, max: 15, supplier: "dairy", storage: "Dry store" },
  { sku: "BR-CRS", name: "Butter croissant", category: "Bakery", unit: "PCS", cost: 45, stock: 22, min: 12, max: 40, supplier: "bakery", storage: "Display", expiresInDays: 1 },
  { sku: "BR-MUF", name: "Blueberry muffin", category: "Bakery", unit: "PCS", cost: 38, stock: 9, min: 10, max: 30, supplier: "bakery", storage: "Display", expiresInDays: 2 },
  { sku: "BR-SOU", name: "Sourdough loaf", category: "Bakery", unit: "PCS", cost: 140, stock: 6, min: 4, max: 12, supplier: "bakery", storage: "Bakery rack", expiresInDays: 3 },
  { sku: "BR-AVO", name: "Avocado", category: "Fruits", unit: "PCS", cost: 85, stock: 14, min: 10, max: 30, supplier: "bakery", storage: "Cold room", expiresInDays: 4 },
  { sku: "BR-PNR", name: "Paneer", category: "Dairy", unit: "KG", cost: 360, stock: 2, min: 1, max: 4, supplier: "dairy", storage: "Cold room", expiresInDays: 3 },
  { sku: "BR-CHK", name: "Roast chicken breast", category: "Meat & Poultry", unit: "KG", cost: 420, stock: 2.4, min: 1, max: 5, supplier: "bakery", storage: "Cold room", expiresInDays: 3 },
  { sku: "BR-CHC", name: "Cheesecake slice", category: "Bakery", unit: "PCS", cost: 95, stock: 10, min: 6, max: 20, supplier: "bakery", storage: "Dessert chiller", expiresInDays: 4 },
];

export const BREW_MENU: MenuItemSeed[] = [
  { sku: "CF-ESP", name: "Espresso", category: "Coffee", price: 129, foodType: "VEG", image: IMG.americano, station: "Bar", prep: 3, recipe: [["BR-ESP", 18, "G"]], weight: 3, role: "drink" },
  { sku: "CF-AMR", name: "Americano", category: "Coffee", price: 159, foodType: "VEG", image: IMG.americano, station: "Bar", prep: 3, recipe: [["BR-ESP", 18, "G"]], weight: 5, role: "drink" },
  { sku: "CF-CAP", name: "Cappuccino", category: "Coffee", price: 189, foodType: "VEG", image: IMG.cappuccino, station: "Bar", prep: 4, bestseller: true, modifiers: ["Milk choice"], recipe: [["BR-ESP", 18, "G"], ["BR-MLK", 150, "ML"]], weight: 9, role: "drink" },
  { sku: "CF-LAT", name: "Café Latte", category: "Coffee", price: 199, foodType: "VEG", image: IMG.latte, station: "Bar", prep: 4, bestseller: true, modifiers: ["Milk choice"], recipe: [["BR-ESP", 18, "G"], ["BR-MLK", 220, "ML"]], weight: 8, role: "drink" },
  { sku: "CF-CBR", name: "Cold Brew", category: "Coffee", price: 219, foodType: "VEG", image: IMG.coldBrew, station: "Bar", prep: 2, recipe: [["BR-ESP", 22, "G"]], weight: 5, role: "drink" },
  { sku: "CF-HCH", name: "Hot Chocolate", category: "Beverages", price: 209, foodType: "VEG", image: IMG.hotChocolate, station: "Bar", prep: 4, recipe: [["BR-CHO", 25, "G"], ["BR-MLK", 220, "ML"], ["BR-SUG", 15, "G"]], weight: 3, role: "drink" },
  { sku: "TE-MCH", name: "Masala Chai", category: "Tea & Infusions", price: 99, foodType: "VEG", image: IMG.chai, station: "Bar", prep: 5, recipe: [["BR-MLK", 120, "ML"], ["BR-SUG", 10, "G"]], weight: 4, role: "drink" },
  { sku: "BF-CRS", name: "Butter Croissant", category: "Breakfast", price: 149, foodType: "VEG", image: IMG.croissant, station: "Kitchen", prep: 3, recipe: [["BR-CRS", 1, "PCS"]], weight: 5, role: "snack" },
  { sku: "BF-AVT", name: "Avocado Toast", category: "Breakfast", price: 329, foodType: "VEG", image: IMG.avocadoToast, station: "Kitchen", prep: 8, featured: true, recipe: [["BR-SOU", 0.2, "PCS"], ["BR-AVO", 1, "PCS"]], weight: 4, role: "main" },
  { sku: "SW-PNS", name: "Paneer Tikka Sandwich", category: "Sandwiches", price: 249, foodType: "VEG", image: IMG.sandwich, station: "Kitchen", prep: 8, recipe: [["BR-SOU", 0.15, "PCS"], ["BR-PNR", 80, "G"]], weight: 4, role: "main" },
  { sku: "SW-CCS", name: "Chicken Club Sandwich", category: "Sandwiches", price: 299, foodType: "NON_VEG", image: IMG.clubSandwich, station: "Kitchen", prep: 9, bestseller: true, recipe: [["BR-SOU", 0.2, "PCS"], ["BR-CHK", 100, "G"]], weight: 5, role: "main" },
  { sku: "DS-MUF", name: "Blueberry Muffin", category: "Desserts", price: 139, foodType: "EGG", image: IMG.muffin, station: "Kitchen", prep: 1, recipe: [["BR-MUF", 1, "PCS"]], weight: 3, role: "dessert" },
  { sku: "DS-BRW", name: "Walnut Brownie", category: "Desserts", price: 159, foodType: "EGG", image: IMG.brownie, station: "Kitchen", prep: 2, weight: 3, role: "dessert" },
  { sku: "DS-CHC", name: "Baked Cheesecake", category: "Desserts", price: 249, foodType: "EGG", image: IMG.cheesecake, station: "Kitchen", prep: 2, recipe: [["BR-CHC", 1, "PCS"]], weight: 2, role: "dessert" },
  { sku: "SD-FRF", name: "Peri-Peri Fries", category: "Sides", price: 169, foodType: "VEG", image: IMG.fries, station: "Kitchen", prep: 7, weight: 3, role: "side" },
  { sku: "CB-BRK", name: "Breakfast Combo", category: "Combos", price: 299, foodType: "VEG", image: IMG.coffeeCroissant, station: "Kitchen", prep: 5, combo: [["BF-CRS", 1], ["CF-CAP", 1]], weight: 3, role: "combo" },
];

export const BREW_MODIFIERS: ModifierGroupSeed[] = [
  { name: "Milk choice", min: 0, max: 1, options: [["Regular milk", 0], ["Oat milk", 60], ["Skimmed milk", 0]] },
];

// ══════════════════════════ Coastal Curry Co. ═══════════════════════════════

export const COASTAL_MENU: MenuItemSeed[] = [
  { sku: "CC-FCR", name: "Surmai Fish Curry Rice", category: "Main Course", price: 349, foodType: "NON_VEG", image: IMG.fishCurry, prep: 10, bestseller: true, weight: 9, role: "main" },
  { sku: "CC-PRF", name: "Prawns Koliwada", category: "Starters", price: 379, foodType: "NON_VEG", image: IMG.prawns, prep: 12, spicy: true, weight: 6, role: "starter" },
  { sku: "CC-CSK", name: "Chicken Sukka", category: "Starters", price: 299, foodType: "NON_VEG", image: IMG.chicken65, prep: 12, weight: 5, role: "starter" },
  { sku: "CC-BFY", name: "Bombil Fry", category: "Starters", price: 259, foodType: "NON_VEG", image: IMG.fishFry, prep: 10, weight: 4, role: "starter" },
  { sku: "CC-VTH", name: "Konkan Veg Thali", category: "Main Course", price: 279, foodType: "VEG", image: IMG.steelThali, prep: 8, weight: 5, role: "main" },
  { sku: "CC-NDS", name: "Neer Dosa (3 pcs)", category: "Breads", price: 99, foodType: "VEG", image: IMG.masalaDosa, prep: 6, weight: 6, role: "bread" },
  { sku: "CC-STR", name: "Steamed Rice", category: "Rice & Biryani", price: 99, foodType: "VEG", image: IMG.cuminRice, prep: 3, weight: 4, role: "rice" },
  { sku: "CC-PBR", name: "Prawn Biryani", category: "Rice & Biryani", price: 429, foodType: "NON_VEG", image: IMG.biryani, prep: 15, weight: 4, role: "rice" },
  { sku: "CC-SOL", name: "Sol Kadhi", category: "Beverages", price: 89, foodType: "VEG", prep: 2, weight: 6, role: "drink" },
  { sku: "CC-KKS", name: "Kokum Sharbat", category: "Beverages", price: 79, foodType: "VEG", image: IMG.limeSoda, prep: 2, weight: 4, role: "drink" },
  { sku: "CC-MDK", name: "Ukadiche Modak", category: "Desserts", price: 149, foodType: "VEG", image: IMG.modak, prep: 2, weight: 2, role: "dessert" },
  { sku: "CC-CHI", name: "Chicken Xacuti", category: "Main Course", price: 359, foodType: "NON_VEG", image: IMG.curry, prep: 14, spicy: true, weight: 5, role: "curry" },
];
