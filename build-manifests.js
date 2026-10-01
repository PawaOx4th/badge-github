const fs = require("fs");
const path = require("path");
const esbuild = require("esbuild");

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function copyFile(source, target) {
  ensureDirectoryExists(path.dirname(target));
  fs.copyFileSync(source, target);
}

function copyDirectory(sourceDir, targetDir) {
  ensureDirectoryExists(targetDir);
  const entries = fs.readdirSync(sourceDir, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      copyFile(sourcePath, targetPath);
    }
  }
}

async function bundleScript(entryPoint, outFile, shouldMinify) {
  try {
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      outfile: outFile,
      minify: shouldMinify,
    });
  } catch (error) {
    console.error(`Error bundling ${entryPoint}:`, error);
    process.exit(1);
  }
}

function baseManifest() {
  return JSON.parse(
    fs.readFileSync(path.join(__dirname, "manifest-base.json"), "utf8")
  );
}

async function buildChrome(buildMode) {
  const chromeDir = path.join(__dirname, "build", "chrome");
  fs.rmSync(chromeDir, { recursive: true, force: true });
  ensureDirectoryExists(chromeDir);

  const chromeManifest = {
    ...baseManifest(),
    background: {
      service_worker: "background.js",
      type: "module",
    },
  };

  fs.writeFileSync(
    path.join(chromeDir, "manifest.json"),
    JSON.stringify(chromeManifest, null, 2)
  );

  await bundleScript(
    path.join(__dirname, "src", "content.js"),
    path.join(chromeDir, "content.js"),
    buildMode === "prod"
  );
  copyFile(
    path.join(__dirname, "src", "background.js"),
    path.join(chromeDir, "background.js")
  );
  copyFile(
    path.join(__dirname, "src", "style.css"),
    path.join(chromeDir, "style.css")
  );
  copyDirectory(path.join(__dirname, "icons"), path.join(chromeDir, "icons"));

  console.log("Chrome build completed successfully!");
}

async function buildFirefox(buildMode) {
  const firefoxDir = path.join(__dirname, "build", "firefox");
  fs.rmSync(firefoxDir, { recursive: true, force: true });
  ensureDirectoryExists(firefoxDir);

  const firefoxManifest = {
    ...baseManifest(),
    background: {
      scripts: ["background.js"],
    },
    browser_specific_settings: {
      gecko: {
        id: "badge-github@local",
      },
    },
  };

  fs.writeFileSync(
    path.join(firefoxDir, "manifest.json"),
    JSON.stringify(firefoxManifest, null, 2)
  );

  await bundleScript(
    path.join(__dirname, "src", "content.js"),
    path.join(firefoxDir, "content.js"),
    buildMode === "prod"
  );
  copyFile(
    path.join(__dirname, "src", "background.js"),
    path.join(firefoxDir, "background.js")
  );
  copyFile(
    path.join(__dirname, "src", "style.css"),
    path.join(firefoxDir, "style.css")
  );
  copyDirectory(path.join(__dirname, "icons"), path.join(firefoxDir, "icons"));

  console.log("Firefox build completed successfully!");
}

(async () => {
  let buildTypes = ["chrome", "firefox"];
  let buildMode = "dev";

  const processArg = (arg) => {
    switch (arg) {
      case "chrome":
      case "firefox":
        return (buildTypes = [arg]);
      case "prod":
      case "dev":
        return (buildMode = arg);
    }
  };

  for (const arg of process.argv.slice(2)) {
    processArg(arg);
  }

  for (const build of buildTypes) {
    if (build === "chrome") {
      await buildChrome(buildMode);
    } else if (build === "firefox") {
      await buildFirefox(buildMode);
    }
  }
})();
