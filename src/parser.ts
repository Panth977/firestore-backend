import * as admin from 'firebase-admin';
import { transformJson } from './helper';
import * as pointer from './ref';
import { z } from 'zod';

/* ****** Local => Firestore ****** */
export interface TEventBy {
    account_name: string;
    account_id: string;
    device_timestamp?: Date;
}
const parseFormJsonToFirestoreDocCreate = transformJson({
    transformTo(val) {
        if (val instanceof Date) return admin.firestore.Timestamp.fromDate(val);
        return val;
    },
    ignoreWhen(val) {
        if (val instanceof admin.firestore.FieldValue) return true;
        if (val instanceof admin.firestore.Timestamp) return true;
        return false;
    },
});
const parseFormJsonToFirestoreDocUpdate = transformJson({
    transformTo(val) {
        if (val instanceof Date) return admin.firestore.Timestamp.fromDate(val);
        if (val === null) return admin.firestore.FieldValue.delete();
        return val;
    },
    ignoreWhen(val) {
        if (val instanceof admin.firestore.FieldValue) return true;
        if (val instanceof admin.firestore.Timestamp) return true;
        return false;
    },
});
export function formJsonToFirestoreDoc(
    event: 'create' | 'update' | 'delete',
    ref: pointer.TDoc<string>,
    json: object,
    eventBy: null | TEventBy
): object {
    if (Object.keys(json).some((x) => x.startsWith('$'))) throw new Error('Not allowed to have root level keys starting with "$..."');
    const accountEvent = {
        account_name: eventBy?.account_name ?? '</ SERVER />',
        by_account_id: eventBy?.account_id ?? 'SERVER_ID()',
        server_iso_timestamp: new Date().toISOString(),
        device_iso_timestamp: eventBy?.device_timestamp?.toISOString(),
    };
    if (event === 'create') {
        Object.assign(json, {
            $ref: ref,
            $on_create: accountEvent,
            $on_update: null,
            $on_delete: null,
            $standard: {
                created_at: admin.firestore.FieldValue.serverTimestamp(),
                updated_at: admin.firestore.FieldValue.serverTimestamp(),
            },
        });
        json = parseFormJsonToFirestoreDocCreate(json);
    } else {
        Object.assign(json, {
            [`$on_${event}`]: accountEvent,
            '$standard.updated_at': admin.firestore.FieldValue.serverTimestamp(),
        });
        json = parseFormJsonToFirestoreDocUpdate(json, 1);
    }
    return json;
}

/* ****** Local <= Firestore ****** */
const AccountEventParser = z.object({
    account_name: z.string(),
    by_account_id: z.string(),
    server_iso_timestamp: z.coerce.date(),
    device_iso_timestamp: z.coerce.date().nullish(),
});
const MetaParser = {
    $ref: z.map(z.string(), z.string()).transform((x) => Object.fromEntries(x)),
    $standard: z.object({ created_at: z.date(), updated_at: z.date() }),
    $on_create: AccountEventParser,
    $on_update: AccountEventParser.nullish(),
    $on_delete: AccountEventParser.nullish(),
};

const parseFormFirestoreDocToJson = transformJson({
    transformTo(val) {
        if (val instanceof admin.firestore.Timestamp) return val.toDate();
        return val;
    },
    ignoreWhen(val) {
        if (val instanceof Date) return true;
        return false;
    },
});
export type TDbDoc<T extends string> = {
    getMetaData(type: '$ref'): pointer.TDoc<T>;
    getMetaData<K extends keyof typeof MetaParser>(type: K): (typeof MetaParser)[K]['_output'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getVal<Z extends z.ZodType>(field: string, parser?: Z): Z extends z.ZodType ? Z['_output'] : any;
    exists: boolean;
};
export function formSnapshotToJson<T extends string>(
    db: FirebaseFirestore.Firestore,
    ref: pointer.TDoc<T> | T,
    snapshot: FirebaseFirestore.DocumentSnapshot
): TDbDoc<T> {
    const cache: Record<string, unknown> = {};
    function getVal(field: string) {
        if (!(field in cache)) cache[field] = parseFormFirestoreDocToJson(snapshot.get(field));
        return cache[field];
    }
    if (typeof ref === 'string') ref = pointer.doc(db, getVal('$ref') as never, snapshot.ref);
    return {
        getMetaData(type: keyof typeof MetaParser) {
            if (!type.startsWith('$')) throw new Error("Can't access non-meta properties, use 'snapshot.getVal()' instead");
            return MetaParser[type].parse(getVal(type)) as never;
        },
        getVal(field, parser) {
            if (field.startsWith('$')) throw new Error("Can't access meta data, use 'snapshot.getMetaData()' instead");
            let val = getVal(field);
            if (parser) val = parser.parse(val);
            return val as never;
        },
        exists: snapshot.exists,
    };
}
