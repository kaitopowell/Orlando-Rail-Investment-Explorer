import { useEffect, useState } from "react";
type Source = {
  source: string;
  year: number;
  downloadDate: string;
  downloadTime: string;
  downloadTimezone: string;
};
export default function CountyAttribution() {
  const [source, setSource] = useState<Source | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/data/counties-source.json", { signal: controller.signal })
      .then((response) => {
        if (!response.ok) throw new Error("Source metadata unavailable");
        return response.json();
      })
      .then(setSource)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, []);
  return (
    <p className="county-attribution">
      {source ? (
        <>
          Boundaries:{" "}
          <a href={source.source} target="_blank" rel="noreferrer">
            U.S. Census Bureau · {source.year}
          </a>
          <br />
          Downloaded {source.downloadDate}, {source.downloadTime}{" "}
          {source.downloadTimezone}.<br />
          Cartographic 1:500,000 · simplified to 75 m.
        </>
      ) : failed ? (
        "County source attribution unavailable. Reload to retry."
      ) : (
        "Loading county source attribution…"
      )}
    </p>
  );
}
