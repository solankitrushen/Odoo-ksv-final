"use client";

import { createContext, useCallback, useContext, useState } from "react";

export type PageTitleState = {
  backHref?: string;
  title: string;
  description?: string;
} | null;

const PageTitleContext = createContext<{
  pageTitle: PageTitleState;
  setPageTitle: (state: PageTitleState) => void;
}>({
  pageTitle: null,
  setPageTitle: () => {},
});

export function PageTitleProvider({ children }: { children: React.ReactNode }) {
  const [pageTitle, setPageTitleState] = useState<PageTitleState>(null);
  const setPageTitle = useCallback((state: PageTitleState) => {
    setPageTitleState(state);
  }, []);
  return (
    <PageTitleContext.Provider value={{ pageTitle, setPageTitle }}>
      {children}
    </PageTitleContext.Provider>
  );
}

export function usePageTitle() {
  return useContext(PageTitleContext);
}
