// Input and channel generation templates for Nextflow script generation

export interface InputConfig {
  selectedFiles: any[];
  [key: string]: any;
}

export function generateFileInputChannels(config: InputConfig): {
  paramsScript: string;
  channelScript: string;
} {
  const { selectedFiles } = config;

  const filenames = selectedFiles.map(
    (file: any) => file.name || file.originalName || "unknown_file"
  );

  let paramsScript = "";
  let channelScript = "";

  if (filenames.length > 0) {
    // Add parameters for input directory and selected files
    paramsScript += `params.inputdir = "./inputs"\n`;
    paramsScript += `params.selected_files = [${filenames
      .map((name: string) => `'${name}'`)
      .join(", ")}]\n\n`;

    // Create channel from file list with proper file staging
    channelScript += `ch_files = Channel.fromList(params.selected_files)\n`;
    channelScript += `    .map { filename -> file("\${params.inputdir}/\${filename}") }\n\n`;
  } else {
    // Fallback if no files
    paramsScript += `params.inputdir = "./inputs"\n`;
    paramsScript += `params.selected_files = []\n\n`;
    channelScript += `ch_files = Channel.empty()\n\n`;
  }

  return { paramsScript, channelScript };
}

export function generateValueInputChannel(config: {
  channelName: string;
  value: any;
  valueType: string;
}): string {
  const { channelName, value, valueType } = config;

  switch (valueType) {
    case "list":
      const listValue = Array.isArray(value) ? value : [value];
      return `${channelName} = Channel.fromList([${listValue
        .map((v) => `'${v}'`)
        .join(", ")}])\n`;
    case "number":
      return `${channelName} = Channel.value(${value})\n`;
    case "boolean":
      return `${channelName} = Channel.value(${value})\n`;
    default: // string
      return `${channelName} = Channel.value('${value}')\n`;
  }
}

export function generateParameterInput(config: {
  paramName: string;
  defaultValue: any;
  paramType: string;
  description?: string;
  required?: boolean;
}): {
  paramsScript: string;
  channelScript: string;
} {
  const { paramName, defaultValue, paramType, description, required } = config;

  let paramsScript = "";
  let channelScript = "";

  // Add parameter definition with comments
  if (description) {
    paramsScript += `// ${description}\n`;
  }

  switch (paramType) {
    case "file":
      paramsScript += `params.${paramName} = "${defaultValue}"\n`;
      channelScript += `ch_${paramName} = Channel.fromPath(params.${paramName})\n`;
      break;
    case "list":
      const listValue = Array.isArray(defaultValue)
        ? defaultValue
        : [defaultValue];
      paramsScript += `params.${paramName} = [${listValue
        .map((v) => `"${v}"`)
        .join(", ")}]\n`;
      channelScript += `ch_${paramName} = Channel.fromList(params.${paramName})\n`;
      break;
    case "number":
      paramsScript += `params.${paramName} = ${defaultValue}\n`;
      channelScript += `ch_${paramName} = Channel.value(params.${paramName})\n`;
      break;
    case "boolean":
      paramsScript += `params.${paramName} = ${defaultValue}\n`;
      channelScript += `ch_${paramName} = Channel.value(params.${paramName})\n`;
      break;
    default: // string
      paramsScript += `params.${paramName} = "${defaultValue}"\n`;
      channelScript += `ch_${paramName} = Channel.value(params.${paramName})\n`;
      break;
  }

  if (required) {
    paramsScript += `// Required parameter: ${paramName}\n`;
  }

  paramsScript += "\n";
  channelScript += "\n";

  return { paramsScript, channelScript };
}
