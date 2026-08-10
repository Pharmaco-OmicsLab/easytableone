import Papa from "papaparse";

self.onmessage = (e: MessageEvent) => {
  const file = e.data.file;
  Papa.parse(file, {
    header: false,
    preview: 20,
    complete: (results) => {
      self.postMessage({ result: results.data });
    },
    error: (err) => {
      self.postMessage({ error: err.message });
    },
  });
};
