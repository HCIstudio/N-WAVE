import { useCallback, useState } from "react";
import { refreshInstalledNfCoreNodes } from "../../api/nfcore";

export const useInstalledNfCoreNodes = () => {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [installedCount, setInstalledCount] = useState(0);

  const refresh = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const count = await refreshInstalledNfCoreNodes();
      setInstalledCount(count);
    } catch (refreshError: any) {
      setError(refreshError?.message || "Failed to load installed nf-core nodes");
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    error,
    installedCount,
    isLoading,
    refresh,
  };
};
