import {addPath, info} from '@actions/core'
import {cacheDir, downloadTool, extractTar, find} from '@actions/tool-cache'

export async function installSauceConnect(scVersion: string): Promise<void> {
    let scPath = find('sc', scVersion, process.arch)

    // Log runner data
    info(`Running on OS: ${process.platform}, Architecture: ${process.arch}`)

    const name = `sauce-connect-${scVersion}_linux.${
        process.arch === 'arm64' ? 'aarch64' : 'x86_64'
    }`

    if (scPath) {
        info(`Found in cache @ ${scPath}`)
    } else {
        const downloadLink = `https://saucelabs.com/downloads/sauce-connect/${scVersion}/${name}.tar.gz`
        info(`Attempting to download sauce-connect ${downloadLink} ...`)
        const downloadedPath = await downloadTool(downloadLink)

        info('Extracting ...')
        const extractedPath = await extractTar(downloadedPath)

        info('Adding to the cache ...')
        scPath = await cacheDir(extractedPath, 'sc', scVersion, process.arch)
    }

    const binPath: string = scPath
    info(`Adding ${binPath} to PATH`)
    addPath(binPath)
}
