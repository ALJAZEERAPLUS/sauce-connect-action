import {getInput, setFailed, warning, info, setOutput} from '@actions/core'
import {installSauceConnect} from './installer'
import {runSc} from './start-sc'
import {appendFileSync, writeFileSync} from 'fs'
import {join} from 'path'

const retryDelays = [1, 1, 1, 2, 3, 4, 5, 10, 20, 40, 60].map(a => a * 1000)

async function run(): Promise<void> {
    try {
        const scVersion = getInput('scVersion')
        const retryTimeout = parseInt(getInput('retryTimeout'), 10) * 1000 * 60
        const startTime = Date.now()

        await installSauceConnect(scVersion)

        let pid: string | undefined

        for (let i = 0; ; i++) {
            try {
                pid = await runSc()

                // Set output for GitHub Actions
                setOutput('sc-pid', pid)

                // Write to GITHUB_STATE for GitHub Actions
                const githubState = process.env.GITHUB_STATE
                if (githubState) {
                    appendFileSync(githubState, `scPid=${pid}\n`, {
                        encoding: 'utf8'
                    })
                }

                // Write to file for local testing (act)
                const pidFile = join(
                    process.env.GITHUB_WORKSPACE || '.',
                    'sc-pid.txt'
                )
                writeFileSync(pidFile, pid, {encoding: 'utf8'})

                info(`Sauce Connect started with PID ${pid}`)
                info('Main action completed, moving to next step')
                break // Exit the retry loop on success
            } catch (e) {
                if (Date.now() - startTime >= retryTimeout) {
                    throw new Error(
                        'Timed out waiting for Sauce Connect to start'
                    )
                }
                const delay = retryDelays[Math.min(retryDelays.length - 1, i)]
                warning(
                    `Error occurred on attempt ${i + 1} (${
                        e instanceof Error ? e.message : String(e)
                    }). Retrying in ${delay} ms...`
                )
                await new Promise<void>(resolve => setTimeout(resolve, delay))
            }
        }

        // Add a small delay to ensure all logs are flushed
        await new Promise(resolve => setTimeout(resolve, 1000))
    } catch (error) {
        setFailed(
            `Sauce Connect action failed: ${
                error instanceof Error ? error.message : String(error)
            }`
        )
    }
}

// Run the action and ensure the process exits
run()
    .then(() => {
        info('Action completed successfully')
        process.exit(0)
    })
    .catch(error => {
        setFailed(
            `Unhandled error in action: ${
                error instanceof Error ? error.message : String(error)
            }`
        )
        process.exit(1)
    })
