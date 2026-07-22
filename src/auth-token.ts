import {randomBytes} from 'crypto';
import {readFile, writeFile, mkdir} from 'fs/promises';
import {existsSync} from 'fs';
import path from 'path';

export const AUTH_TOKEN_FILENAME = 'auth-token';
export const AUTH_TOKEN_ENV = 'CASTELLAN_AUTH_TOKEN';

export type AuthTokenSource = 'config' | 'env' | 'file' | 'generated';

export type ResolvedAuthToken = {
    token: string | undefined;
    source: AuthTokenSource | 'none';
    tokenFilePath?: string;
};

export function generateAuthToken(): string {

    return randomBytes(32).toString('base64url');

}

export async function resolveAuthToken(
    configToken: string | undefined,
    stateFilePath: string,
): Promise<ResolvedAuthToken> {

    if (configToken) {

        return {token: configToken, source: 'config'};

}

    const envToken = process.env[AUTH_TOKEN_ENV]?.trim();

    if (envToken) {

        return {token: envToken, source: 'env'};

}

    const stateDir = path.dirname(stateFilePath);
    const tokenFilePath = path.join(stateDir, AUTH_TOKEN_FILENAME);

    if (existsSync(tokenFilePath)) {

        const token = (await readFile(tokenFilePath, 'utf8')).trim();

        if (token) {

            return {token, source: 'file', tokenFilePath};

}

}

    const token = generateAuthToken();

    await mkdir(stateDir, {recursive: true});
    await writeFile(tokenFilePath, `${token}\n`, {encoding: 'utf8', mode: 0o600});

    return {token, source: 'generated', tokenFilePath};

}
