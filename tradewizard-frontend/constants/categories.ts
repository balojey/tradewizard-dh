export type CategoryId = string;

export interface Category {
  id: CategoryId;
  label: string;
  tagId: number | null;
}

export interface PoliticalSubcategory {
  label: string;
  id: number;
  count: number;
}

// Base political categories - All is first, Trending is default
export const BASE_CATEGORIES: Category[] = [
  {
    id: "all",
    label: "All",
    tagId: 2, // Politics tag ID - shows all political markets
  },
  {
    id: "trending",
    label: "Trending",
    tagId: 2, // Politics tag ID - shows all political markets (same as All but with trending logic)
  },
];

export const DEFAULT_CATEGORY: CategoryId = "trending";

export function getCategoryById(id: CategoryId, categories: Category[]): Category | undefined {
  return categories.find((c) => c.id === id);
}

// Helper to create category from political subcategory
export function createCategoryFromSubcategory(subcategory: PoliticalSubcategory): Category {
  return {
    id: subcategory.label.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, ''),
    label: subcategory.label,
    tagId: subcategory.id,
  };
}

