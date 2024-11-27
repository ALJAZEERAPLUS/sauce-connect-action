import {
    getInput,
    isDebug,
    warning,
    info as coreInfo,
    setFailed,
    setOutput
} from '@actions/core'
import {which} from '@actions/io'
import {spawn, ChildProcess} from 'child_process'
import {info} from 'console'
import {mkdtempSync, writeFileSync} from 'fs'
import {tmpdir} from 'os'
import {join} from 'path'
import optionMappingJson from './option-mapping.json'
import axios from 'axios'
import {delay} from './wait'

const tmp = mkdtempSync(join(tmpdir(), `sauce-connect-action`))
const LOG_FILE = join(tmp, 'sauce-connect.log')

type OptionMapping = {
    actionOption: string
    scOption: string
    required?: boolean
    relativePath?: boolean
    flag?: boolean
}
const optionMappings: OptionMapping[] = optionMappingJson

function buildOptions(): string[] {
    const params = ['run', `--log-file=${LOG_FILE}`]
    info(`Log file path: ${LOG_FILE}`)

    for (const optionMapping of optionMappings) {
        const input = getInput(optionMapping.actionOption, {
            required: optionMapping.required
        })

        if (input === '') {
            // user input nothing for this option
        } else if (optionMapping.flag) {
            // for boolean flag options like `--tunnel-pool`
            params.push(`--${optionMapping.scOption}`)
        } else {
            params.push(`--${optionMapping.scOption}=${input}`)
        }
    }
    return params
}

export async function startSc(): Promise<ChildProcess> {
    const cmd = await which('sc')
    const args = buildOptions()

    // Extract the API address from the arguments
    const apiAddressArg = args.find(arg => arg.startsWith('--api-address='))
    const apiAddress = apiAddressArg
        ? apiAddressArg.split('=')[1]
        : '0.0.0.0:8080'

    info(`[command]${cmd} ${args.map(arg => `${arg}`).join(' ')}`)
    const child = spawn(cmd, args, {
        stdio: ['ignore'],
        detached: true
    })

    child.on('exit', (code, signal) => {
        if (code !== null) {
            warning(`Sauce Connect process exited with code ${code}`)
        } else if (signal !== null) {
            warning(`Sauce Connect process was killed with signal ${signal}`)
        }
    })

    try {
        info('Waiting for Sauce Connect to start...')
        await delay(30000) // Wait for 30 seconds

        info('Checking if Sauce Connect tunnel is ready...')
        info(`Attempting to connect to API at: ${apiAddress}`)
        const response = await axios.get(`http://${apiAddress}/readyz`, {
            timeout: 10000
        })
        if (response.status === 200) {
            info('Sauce Connect is ready')
            return child
        }
    } catch (e) {
        warning(`Error occurred: ${e}`)
        child.kill()
        throw e
    }
    throw new Error('Sauce Connect did not start within the expected time.')
}

export async function runSc(): Promise<string> {
    try {
        const scProcess = await startSc()
        const pid = scProcess.pid?.toString()
        if (!pid) {
            throw new Error('Failed to get PID from Sauce Connect process')
        }
        coreInfo(`Sauce Connect started with PID ${pid}`)
        return pid
    } catch (error) {
        setFailed(
            `Error in Sauce Connect: ${
                error instanceof Error ? error.message : String(error)
            }`
        )
        throw error
    }
}
