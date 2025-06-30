import { useMemo } from "react";
import type { FileObject, NodeData } from "../../components/nodes/BaseNode";
import { useProcessOperatorLogic } from "./useProcessOperatorLogic";

export const useMapOperator = (
  incomingFiles: FileObject[],
  nodeData: NodeData,
  onSave: (data: Partial<NodeData>) => void
) => {
  const {
    mapOperation = "changeCase",
    mapChangeCase = "toUpperCase",
    mapReplaceFind = "",
    mapReplaceWith = "",
  } = nodeData;

  const mappedFiles = useMemo((): FileObject[] => {
    return incomingFiles.map((file) => {
      // Handle cases where file content is undefined or null
      if (!file.content) {
        return {
          ...file,
          content: "",
          size: 0,
        };
      }

      const lines = file.content.split("\n");
      const processedContent = lines
        .map((line) => {
          if (!line) return line;
          switch (mapOperation) {
            case "changeCase":
              return mapChangeCase === "toLowerCase"
                ? line.toLowerCase()
                : line.toUpperCase();
            case "replaceText":
              if (!mapReplaceFind) return line;
              try {
                return line.replace(
                  new RegExp(mapReplaceFind, "g"),
                  mapReplaceWith
                );
              } catch (e) {
                return line;
              }
            default:
              return line;
          }
        })
        .join("\n");

      return {
        ...file,
        content: processedContent,
        size: processedContent.length,
      };
    });
  }, [
    incomingFiles,
    mapOperation,
    mapChangeCase,
    mapReplaceFind,
    mapReplaceWith,
    nodeData._refreshTimestamp,
  ]);

  useProcessOperatorLogic(mappedFiles, "map", onSave, incomingFiles);
};
