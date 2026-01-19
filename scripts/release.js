import { $, Glob } from "bun"
import prompts from "prompts"

let nextVersion
const packages = Array.from(new Glob("packages/*/package.json").scanSync())

for (const pkgPath of packages) {
    const pkgDir = pkgPath.replace("/package.json", "")
    await $`bun run bundle`.cwd(pkgDir)
}

await bumpIt()

await prompts({
    initial: true,
    message: "Commit?",
    name: "shippit",
    type: "confirm",
}, { onCancel })
    .then(_ => _.shippit && commitIt())

await prompts({
    initial: true,
    message: "Publish?",
    name: "shippit",
    type: "confirm",
}, { onCancel })
    .then(_ => _.shippit && publishIt())

await prompts({
    initial: true,
    message: "Push?",
    name: "shippit",
    type: "confirm",
}, { onCancel })
    .then(_ => _.shippit && pushIt())

async function bumpIt() {
    const files = new Map()

    for (const file of ["bun.lock", ...packages]) {
        const contents = await Bun.file(file).text()
        files.set(file, contents)
    }

    for await (const [file, contents] of files) {
        const lines = contents.split("\n")
        const prevVersion = contents.match(/"version": "(.+?)"/)[1]
        nextVersion ??= (await prompts({
            message: `Version (Current: ${prevVersion})`,
            name: "version",
            type: "text",
        }, { onCancel })).version

        for (let i = 0; i < lines.length; i++) {
            const prevLine = lines[i]
            const nextLine = prevLine.replace(`"version": "${prevVersion}"`, `"version": "${nextVersion}"`)
            if (prevLine === nextLine) continue
            console.log(`\x1B[34m${file}\x1B[0m`)
            console.log(lines.slice(i - 2, i).join("\n"))
            console.log(`\x1B[31m${prevLine}\x1B[0m → \x1B[32m${nextLine.trim()}\x1B[0m`)
            console.log(lines.slice(i + 1, i + 3).join("\n"))
            const { replace } = await prompts({
                initial: true,
                message: "Replace?",
                name: "replace",
                type: "confirm",
            }, { onCancel })
            if (replace) lines[i] = nextLine
        }

        await Bun.write(file, lines.join("\n"))
    }
}

async function commitIt() {
    const { commitMsg } = await prompts({
        initial: `chore: release v${nextVersion}`,
        message: "Commit message",
        name: "commitMsg",
        type: "text",
    }, { onCancel })

    for (const file of ["bun.lock", ...packages]) await $`git add ${file}`
    await $`git commit --message ${commitMsg}`
    await $`git tag --annotate --message ${commitMsg} v${nextVersion}`
}

async function publishIt() {
    await $`npm login`
    for (const pkgPath of packages) {
        const pkgDir = pkgPath.replace("/package.json", "")
        await $`bun publish --access public`.cwd(pkgDir)
    }
}

async function pushIt() {
    await $`git push`
    await $`git push --tags`
}

function onCancel() {
    process.exit(0)
}
