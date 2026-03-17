"use client";

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import { createClient } from "@/lib/supabase/client";

interface Brand {
  id: string;
  name: string;
  url: string | null;
  primary_color: string | null;
}

interface BrandContextValue {
  brands: Brand[];
  selectedBrandId: string | null;
  selectedBrand: Brand | null;
  setSelectedBrandId: (id: string | null) => void;
  refreshBrands: () => Promise<void>;
  loading: boolean;
}

const BrandContext = createContext<BrandContextValue>({
  brands: [],
  selectedBrandId: null,
  selectedBrand: null,
  setSelectedBrandId: () => {},
  refreshBrands: async () => {},
  loading: true,
});

export function useBrand() {
  return useContext(BrandContext);
}

const STORAGE_KEY = "vibeads_selected_brand";

export function BrandProvider({ children }: { children: ReactNode }) {
  const supabase = createClient();
  const [brands, setBrands] = useState<Brand[]>([]);
  const [selectedBrandId, setSelectedBrandIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [initialized, setInitialized] = useState(false);

  const fetchBrands = useCallback(async () => {
    const { data } = await supabase
      .from("brands")
      .select("id, name, url, primary_color")
      .order("created_at", { ascending: true });

    const brandList = (data ?? []) as Brand[];
    setBrands(brandList);
    return brandList;
  }, [supabase]);

  // Initial load
  useEffect(() => {
    async function init() {
      const brandList = await fetchBrands();

      // Restore from localStorage
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored && brandList.some((b) => b.id === stored)) {
        setSelectedBrandIdState(stored);
      } else if (brandList.length > 0) {
        setSelectedBrandIdState(brandList[0].id);
      }

      setLoading(false);
      setInitialized(true);
    }
    init();
  }, [fetchBrands]);

  function setSelectedBrandId(id: string | null) {
    setSelectedBrandIdState(id);
    if (id) {
      localStorage.setItem(STORAGE_KEY, id);
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  }

  const refreshBrands = useCallback(async () => {
    const brandList = await fetchBrands();
    // If current selection is no longer valid, select first
    if (selectedBrandId && !brandList.some((b) => b.id === selectedBrandId)) {
      const newId = brandList.length > 0 ? brandList[0].id : null;
      setSelectedBrandId(newId);
    }
    // If no selection but brands exist, select first
    if (!selectedBrandId && brandList.length > 0) {
      setSelectedBrandId(brandList[0].id);
    }
  }, [fetchBrands, selectedBrandId]);

  const selectedBrand = brands.find((b) => b.id === selectedBrandId) ?? null;

  return (
    <BrandContext.Provider
      value={{
        brands,
        selectedBrandId,
        selectedBrand,
        setSelectedBrandId,
        refreshBrands,
        loading,
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}
