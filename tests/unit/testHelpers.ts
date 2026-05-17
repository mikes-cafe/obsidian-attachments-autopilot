export function twinDir(folder: string): string {
  const base = folder === "" ? "files" : folder.split("/").pop()!;
  return folder === "" ? `${base}-twins` : `${folder}/${base}-twins`;
}

export function twinFile(folder: string, name: string): string {
  return `${twinDir(folder)}/${name}`;
}

export function previewDir(folder: string): string {
  return `${twinDir(folder)}/preview`;
}

export function previewFile(folder: string, name: string): string {
  return `${previewDir(folder)}/${name}`;
}
