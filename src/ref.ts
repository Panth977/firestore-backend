import { TDocFields } from './parser';
import * as admin from 'firebase-admin';

type TParams<T extends string> = T extends `${string}/{${infer A}}${infer B}` ? [A, ...TParams<B>] : [];
type TPop<T extends string[]> = T extends [...infer A, string] ? A : T;
type Params<T extends string, popLast extends boolean> = {
    [k in popLast extends true ? TPop<TParams<T>>[number] : TParams<T>[number]]: string;
};

function parseDataToPath<T extends TDocArg<string> | TQueryArg<string>>(
    data: T,
    isColl: boolean
): { path: string; removedTrailing: boolean; params: T } {
    const params: T = { $: data.$ } as never;
    if (!data.$.includes('{')) return { path: data.$, removedTrailing: false, params };
    let path: string = data.$;
    if (isColl) path = data.$.substring(0, data.$.lastIndexOf('/'));
    for (const param in data) {
        if (path.includes(`{${param}}`)) {
            const v = (data as Record<string, string>)[param];
            path = path.replace(`{${param}}`, v);
            params[param] = v as never;
        }
    }
    if (isColl) path += data.$.substring(data.$.lastIndexOf('/'));
    if ((path + '{').indexOf('{') < path.lastIndexOf('/')) throw new Error('incomplete arguments');
    if (path.includes('{')) return { path: path.substring(0, path.lastIndexOf('/')), removedTrailing: true, params };
    return { path, removedTrailing: false, params };
}

/* ****** DOC ****** */
const docRef = Symbol();
type TDocRef<T extends string> = {
    $: T;
    [docRef]: FirebaseFirestore.DocumentReference;
};
export type TDocArg<T extends string> = { $: T } & Params<T, false>;
export type TDoc<T extends string> = TDocRef<T> & Params<T, false>;
export const autoDocID = '{undefined}' as never;

export function doc<T extends string>(db: FirebaseFirestore.Firestore, data: TDocArg<T> | TDoc<T>): TDoc<T> {
    const path = parseDataToPath(data, false);
    if (path.removedTrailing) {
        const ref = db.collection(path.path).doc();
        return Object.assign(path.params, {
            [docRef]: ref,
            [data.$.substring(data.$.lastIndexOf('/') + 2, data.$.length - 1)]: ref.id,
        });
    }
    return Object.assign(data, {
        [docRef]: db.doc(path.path),
    });
}
export function getDocRef(doc: TDoc<string>) {
    return doc[docRef];
}

/* ****** QUERY ****** */
const queryRef = Symbol();
const queryParams = Symbol();
type TQueryRef<T extends string> = {
    $: T;
    [queryRef]: FirebaseFirestore.Query;
    [queryParams]: QueryParams;
};
export type QueryParams = {
    filters?: [TDocFields, '<' | '<=' | '==' | '!=' | '>=' | '>' | 'array-contains' | 'in' | 'not-in' | 'array-contains-any', unknown][];
    allowDeleted?: boolean;
};
export type TQueryArg<T extends string> = { $: T } & Params<T, true>;
export type TQuery<T extends string> = TQueryRef<T> & Params<T, true>;

function getFilterVal(val: unknown) {
    if (val instanceof Date) return admin.firestore.Timestamp.fromDate(val);
    return val;
}

export function query<T extends string>(db: FirebaseFirestore.Firestore, data: TQueryArg<T>, params: QueryParams): TQuery<T> {
    let query;
    const path = parseDataToPath(data, true);
    if (path.removedTrailing) {
        query = db.collection(path.path);
    } else {
        query = db.collectionGroup(path.path);
    }
    if (!params.allowDeleted) {
        if (!params.filters) params.filters = [];
        params.filters.push(['$on_delete', '==', null]);
    }
    if (params.filters) for (const [field, op, val] of params.filters) query = query.where(field, op, getFilterVal(val));
    return Object.assign(data, { [queryRef]: query, [queryParams]: params });
}
export function getQueryRef(query: TQuery<string>) {
    return query[queryRef];
}
export function getQueryParams(query: TQuery<string>) {
    return query[queryParams];
}
