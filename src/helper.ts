export function transformJson({
    transformTo: transformer,
    ignoreWhen: ignoredVal,
}: {
    transformTo: (val: unknown) => unknown;
    ignoreWhen: (val: unknown) => boolean;
}) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return function service(json: any, depth = Number.POSITIVE_INFINITY) {
        json = transformer(json);
        if (!json || ignoredVal(json)) return;
        if (depth === 0) return json;
        if (Array.isArray(json)) {
            json = json.map((x) => service(x, depth - 1)).filter((x) => x !== undefined);
        } else if (typeof json === 'object') {
            for (const key in json) {
                if (Object.prototype.hasOwnProperty.call(json, key)) {
                    json[key] = service(json[key], depth - 1);
                }
            }
        }
        return json;
    };
}
export function transformMapToJson<K, V>(map: Map<K, V>, keyTransformer: (k: K) => string) {
    const out: { [k in string]: V } = {};
    for (const key of map.keys()) out[keyTransformer(key)] = map.get(key) as never;
    return out;
}
