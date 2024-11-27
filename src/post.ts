import {warning, setFailed, info, getState} from '@actions/core'
import {stopSc} from './stop-sc'
import {readFileSync, unlinkSync} from 'fs'
import {join} from 'path'

async function cleanup(): Promise<void> {
    info('Starting post-action cleanup')
    let pid: string | undefined

    // Try to get PID from GitHub Actions state
    pid = getState('scPid')

    // If not found, try to read from file
    if (!pid) {
        const pidFile = join(process.env.GITHUB_WORKSPACE || '.', 'sc-pid.txt')
        try {
            pid = readFileSync(pidFile, 'utf-8').trim()
            info(`Retrieved PID from file: ${pid}`)
            unlinkSync(pidFile) // Delete the file after reading
        } catch (error) {
            warning(
                `Failed to read PID file: ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }
    }

    if (pid) {
        try {
            await stopSc(pid)
            info(`Successfully stopped Sauce Connect process with PID ${pid}`)
        } catch (error) {
            warning(
                `Failed to stop Sauce Connect: ${
                    error instanceof Error ? error.message : String(error)
                }`
            )
        }
    } else {
        warning('No Sauce Connect PID found, skipping cleanup')
    }
    info('Post-action cleanup completed')
}

cleanup().catch(error => {
    setFailed(
        `Post-action cleanup failed: ${
            error instanceof Error ? error.message : String(error)
        }`
    )
})
