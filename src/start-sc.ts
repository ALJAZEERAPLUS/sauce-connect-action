import {debug, getInput, isDebug, warning} from '@actions/core'
import {which} from '@actions/io'
import {spawn} from 'child_process'
import {info} from 'console'
import {mkdtempSync, readFileSync, existsSync, mkdirSync} from 'fs'
import {tmpdir} from 'os'
import {dirname, join} from 'path'
import optionMappingJson from './option-mapping.json'
import {stopSc} from './stop-sc'
import {wait} from './wait'
import axios from 'axios'

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

    if (!existsSync(tmp)) {
        info(`Temporary directory does not exist. Creating: ${tmp}`)
        mkdirSync(tmp, {recursive: true})
        info('Temporary directory created')
    } else {
        info('Temporary directory already exists')
    }

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

function getApiAddress(args: string[]): string {
    const apiAddressArg = args.find(arg => arg.startsWith('--api-address='))
    if (apiAddressArg) {
        return apiAddressArg.split('=')[1]
    }
    throw new Error('API address not found in arguments')
}

export async function startSc(): Promise<string> {
    const cmd = await which('sc')
    const args = buildOptions()

    info(`[command]${cmd} ${args.map(arg => `${arg}`).join(' ')}`)
    const child = spawn(cmd, args, {
        stdio: 'ignore',
        detached: true
    })
    child.unref()

    let errorOccurred = false
    try {
        const response = await axios.get(`http://${getApiAddress(args)}/readyz`)
        if (response.status === 200) {
            info('Sauce Connect is ready')
            return String(child.pid)
        }
    } catch (e) {
        errorOccurred = true
        if (child.pid) {
            await stopSc(String(child.pid))
        }
        throw e
    } finally {
        if (errorOccurred || isDebug()) {
            try {
                const log = readFileSync(LOG_FILE, {
                    encoding: 'utf-8'
                })
                ;(errorOccurred ? warning : debug)(`Sauce connect log: ${log}`)
            } catch (e2) {
                warning(`Unable to access Sauce connect log file: ${e2}.
                This could be caused by an error with the Sauce Connect or Github Action configuration that prevented Sauce Connect from starting up.
                Please verify your configuration and ensure any referenced files are available.`)
            }
        }
    }
    throw new Error('Sauce Connect did not start within the expected time.')
}
