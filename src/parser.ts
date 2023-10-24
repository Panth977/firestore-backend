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
export const MetaParser = z.object({
    $standard: z.object({ created_at: z.date(), updated_at: z.date() }),
    $on_create: AccountEventParser,
    $on_update: AccountEventParser.nullable(),
    $on_delete: AccountEventParser.nullable(),
});
type TAccountEventFields = `account_name` | `by_account_id` | `server_iso_timestamp` | `device_iso_timestamp`;
type TMetaFields =
    | `$standard.${`created_at` | `updated_at`}`
    | `$on_create.${TAccountEventFields}`
    | `$on_update`
    | `$on_delete`
    | `$on_update.${TAccountEventFields}`
    | `$on_delete.${TAccountEventFields}`;
export type TDocFields = TMetaFields | (string & Record<never, never>);

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
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    data(): (typeof MetaParser)['_output'] & { $ref: pointer.TDoc<T> } & Record<string, any>;
    getVal(type: '$ref'): pointer.TDoc<T>;
    getVal<K extends keyof typeof MetaParser.shape>(type: K): (typeof MetaParser.shape)[K]['_output'];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    getVal<T = any>(field: string): T;
    getVal<Z extends z.ZodType>(field: string, parser: Z): Z['_output'];
    exists: boolean;
};
export function fromSnapshotToJson<T extends string>(
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
        data() {
            if (!snapshot.exists) new Error('No data found');
            return Object.assign(snapshot.data() as never, { ref: ref });
        },
        getVal(field: string, parser?: z.ZodType) {
            if (field === '$ref') return ref as never;
            parser ??= (MetaParser.shape as Record<string, z.ZodType>)[field] as never;
            let val = getVal(field);
            if (parser) val = parser.parse(val);
            return val as never;
        },
        exists: snapshot.exists,
    };
}
/* ****** Local <=> Json ****** */
export function encodeField(val: unknown) {
    if (val instanceof admin.firestore.Timestamp) return JSON.stringify({ type: 'Timestamp', val: val.toDate().getTime() });
    return JSON.stringify({ val });
}
export function decodeField(str: string) {
    const proxy = JSON.parse(str);
    if (proxy.type === 'Timestamp') return admin.firestore.Timestamp.fromDate(new Date(proxy.val));
    return proxy.val;
}
