let envMutex: Promise<void> = Promise.resolve();

export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => T | Promise<T>): Promise<T> {

    await envMutex;

    let release!: () => void;

    envMutex = new Promise<void>((resolve) => {

        release = resolve;

});

    const previous: Record<string, string | undefined> = {};

    for (const [name, value] of Object.entries(vars)) {

        previous[name] = process.env[name];

        if (value === undefined) {

            delete process.env[name];

} else {

            process.env[name] = value;

}

}

    try {

        return await fn();

} finally {

        for (const [name, value] of Object.entries(previous)) {

            if (value === undefined) {

                delete process.env[name];

} else {

                process.env[name] = value;

}

}

        release();

}

}
