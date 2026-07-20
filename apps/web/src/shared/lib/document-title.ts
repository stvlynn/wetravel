import { useEffect } from "react";

/**
 * Syncs `document.title` while the caller is mounted and restores the
 * previous title on unmount. Inside the WeChat Mini Program WebView the
 * native navigation bar mirrors the document title, so this is also how
 * embedded pages label the native chrome.
 */
export function useDocumentTitle(title: string | undefined): void {
  useEffect(() => {
    if (!title) return;
    const previous = document.title;
    document.title = title;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
