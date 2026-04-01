import { useQuery } from "@tanstack/react-query";
import { BASE_CATEGORIES, createCategoryFromSubcategory, type Category, type PoliticalSubcategory } from "@/constants/categories";

export default function usePoliticalCategories() {
  return useQuery({
    queryKey: ["political-categories"],
    queryFn: async (): Promise<Category[]> => {
      try {
        const response = await fetch("/api/polymarket/political-categories");
        
        if (!response.ok) {
          throw new Error("Failed to fetch political categories");
        }

        const subcategories: PoliticalSubcategory[] = await response.json();
        
        // Combine base categories with dynamic political subcategories
        const dynamicCategories = subcategories.map(createCategoryFromSubcategory);
        
        return [...BASE_CATEGORIES, ...dynamicCategories];
      } catch (error) {
        console.warn("Failed to fetch dynamic categories, using base categories:", error);
        return BASE_CATEGORIES;
      }
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
    refetchInterval: 10 * 60 * 1000, // Refetch every 10 minutes
    refetchOnWindowFocus: false,
  });
}