// One publication cohort contains both native targets. Diagnostics may still
// describe only their build host; neither case installs a compiler for consumers.
export const NATIVE_PLATFORMS = Object.freeze(["linux-x64", "win32-x64"]);

export function nativeResources(platform) {
  if (!NATIVE_PLATFORMS.includes(platform)) throw new Error("Unsupported native artifact platform");
  return ["core", "agy-adapter"].flatMap(directory => {
    const name = directory === "core" ? "acp-supervisor" : "agy-supervisor";
    const files = platform === "linux-x64"
      ? [[name, 0o755], [name + ".c", 0o644], [name + "-glibc-compat.c", 0o644]]
      : [[name + ".exe", 0o644], ["windows-supervisor.c", 0o644],
        ["windows-private.c", 0o644], ["windows-private.h", 0o644]];
    return files.map(([filename, mode]) => ({ directory, path: "dist/" + filename,
      artifactPath: directory + "/" + filename, mode,
      sourceFile: filename.endsWith(".exe") || filename === name ? undefined :
        platform === "win32-x64" ? filename : filename === name + ".c" ? "supervisor.c" : "glibc-startup-compat.c",
      binary: filename === name || filename === name + ".exe" }));
  });
}

export function publicationRequiredFiles(delivery) {
  const extra = NATIVE_PLATFORMS.flatMap(platform => nativeResources(platform))
    .filter(resource => resource.directory === delivery.directory).map(resource => resource.path);
  return [...new Set([...delivery.requiredFiles, ...extra])];
}
