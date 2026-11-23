import {
  SNAPSHOT_NEEDED_BY_HEADER,
  readSnapshotNeededBy,
  writeSnapshotNeededBy,
} from '../../src/api';

// How the API tells a phone that keeps up which member devices a snapshot is needed by
// (ADR-0034): one header of a page's answer, which the API writes and the phone reads with
// the same two functions. A value that is not written exactly so names nobody.

const CASEY = '7c9e6679-7425-40de-944b-e07fc1f90ae7';
const OTHER = '4b1d7a52-6f0e-4c83-9a2b-5d3e8f7c1a90';
const THIRD = '0f8fad5b-d9cb-469f-a165-70867728950e';

describe('SYNC-163.1', () => {
  test('[SYNC-163.1] reads one device ID, and several in the order they are written, from the header x-snapshot-needed-by', () => {
    expect(SNAPSHOT_NEEDED_BY_HEADER).toBe('x-snapshot-needed-by');
    expect(readSnapshotNeededBy(CASEY)).toEqual([CASEY]);
    expect(readSnapshotNeededBy(`${CASEY},${OTHER}`)).toEqual([CASEY, OTHER]);
    expect(readSnapshotNeededBy(`${OTHER},${CASEY},${THIRD}`)).toEqual([
      OTHER,
      CASEY,
      THIRD,
    ]);
  });

  test('[SYNC-163.1] writes device IDs in the order given, joined by one comma, as it reads them', () => {
    expect(writeSnapshotNeededBy([CASEY])).toBe(CASEY);
    expect(writeSnapshotNeededBy([CASEY, OTHER])).toBe(`${CASEY},${OTHER}`);
    expect(writeSnapshotNeededBy([OTHER, CASEY, THIRD])).toBe(
      `${OTHER},${CASEY},${THIRD}`,
    );
    for (const ids of [[CASEY], [OTHER, CASEY], [THIRD, OTHER, CASEY]]) {
      expect(readSnapshotNeededBy(writeSnapshotNeededBy(ids))).toEqual(ids);
    }
  });

  test.each<[string, unknown]>([
    ['is null, as a header that is not there', null],
    ['is nothing', undefined],
  ])('[SYNC-163.1] reads nobody when the value %s', (_, value) => {
    expect(readSnapshotNeededBy(CASEY)).toEqual([CASEY]);

    expect(readSnapshotNeededBy(value)).toEqual([]);
  });

  test.each<[string, unknown]>([
    ['that is empty', ''],
    ['with a space after the comma', `${CASEY}, ${OTHER}`],
    ['with a space before the first ID', ` ${CASEY}`],
    ['with a space after the last ID', `${CASEY} `],
    ['that ends with a comma', `${CASEY},`],
    ['that starts with a comma', `,${CASEY}`],
    ['with two commas between the IDs', `${CASEY},,${OTHER}`],
    ['with a semicolon between the IDs', `${CASEY};${OTHER}`],
    ['with a line feed after it', `${CASEY}\n`],
    ['with the same ID twice', `${CASEY},${CASEY}`],
    ['with the same ID twice, apart', `${CASEY},${OTHER},${CASEY}`],
    ['in capitals', CASEY.toUpperCase()],
    ['with one ID in capitals', `${CASEY},${OTHER.toUpperCase()}`],
    ['of a version-1 UUID', '7c9e6679-7425-10de-944b-e07fc1f90ae7'],
    ['of a UUID of another variant', '7c9e6679-7425-40de-c44b-e07fc1f90ae7'],
    ['one character short', CASEY.slice(0, -1)],
    ['one character long', `${CASEY}0`],
    ['with no hyphens', CASEY.replaceAll('-', '')],
    ['with one ID right and one wrong', `${CASEY},not-a-device`],
    ['that says none', 'none'],
    ['that says true', 'true'],
    ['that is a number', 1],
    ['that is true', true],
    ['that is an array of IDs', [CASEY]],
    ['that is an object', { devices: [CASEY] }],
  ])('[SYNC-163.1] reads nobody from a value %s', (_, value) => {
    // The value written rightly, so that this is no test of a function that reads nobody ever.
    expect(readSnapshotNeededBy(CASEY)).toEqual([CASEY]);

    expect(readSnapshotNeededBy(value)).toEqual([]);
  });

  test.each<[string, string[]]>([
    ['no device ID', []],
    ['the same device ID twice', [CASEY, CASEY]],
    ['a device ID in capitals', [CASEY.toUpperCase()]],
    ['a device ID with a comma in it', [`${CASEY},${OTHER}`]],
    ['something that is no device ID', [CASEY, 'casey']],
  ])('[SYNC-163.1] throws when asked to write %s', (_, ids) => {
    expect(writeSnapshotNeededBy([CASEY])).toBe(CASEY);

    expect(() => writeSnapshotNeededBy(ids)).toThrow();
  });
});
