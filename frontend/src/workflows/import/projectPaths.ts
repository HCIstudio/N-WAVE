// Paths of a project's files, relative to each other (`../../modules/x/main`).

/** `a/b/../c` → `a/c`; no leading `./`. */
export const normalizePath = (path: string): string => {
  const parts: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === "..") parts.pop();
    else parts.push(part);
  }
  return parts.join("/");
};

/** `target` (from the files' root) as seen from the folder `base`: `./modules/x`, `../lib/y`. */
export const relativePath = (base: string, target: string): string => {
  const from = base ? base.split("/") : [];
  const to = target.split("/");
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared += 1;
  const up = from.length - shared;
  const rest = to.slice(shared).join("/");
  return up === 0 ? `./${rest}` : `${"../".repeat(up)}${rest}`;
};

export const directoryOf = (path: string): string => (path.includes("/") ? path.slice(0, path.lastIndexOf("/")) : "");
