import { expect } from 'chai';
import { buildPackageFromText } from '../src/buildPackage';

describe('buildPackageFromText', () => {
  const version = '64.0'; // not used, hardcoded in function

  function assertXmlPackage(result: string | undefined) {
     const s = String(result);
     expect(s).to.be.a('string');
     expect(/<\?xml\b/.test(s)).to.be.true;
     expect(/<Package\b[^>]*xmlns="http:\/\/soap.sforce.com\/2006\/04\/metadata"/.test(s)).to.be.true;
     expect(/<version>64\.0<\/version>/.test(s)).to.be.true;
     const trimmed = s.trim();
     expect(/<\/Package>\s*$/.test(trimmed)).to.be.true;
     const versionIndex = s.indexOf('<version>64.0</version>');
     const closingIndex = s.lastIndexOf('</Package>');
     expect(versionIndex).to.be.greaterThan(-1);
     expect(closingIndex).to.be.greaterThan(versionIndex);
  }

  it('should handle single member selection', () => {
    const text = `<members>ApexClass3</members>`;
    const ranges = [{ start: 0, end: text.length }];
    const result = buildPackageFromText(text, ranges);
    expect(result).to.contain('<members>ApexClass3</members>');
    expect(result).to.contain('<name></name>');
    expect(result).to.contain(`<version>64.0</version>`);
    assertXmlPackage(result);
  });

  it('should handle multiple members of same type', () => {
    const text = `<members>ApexClass3</members>\n<members>ApexClass4</members>`;
    const ranges = [{ start: 0, end: text.length }];
    const result = buildPackageFromText(text, ranges);
    expect(result).to.contain('<members>ApexClass3</members>');
    expect(result).to.contain('<members>ApexClass4</members>');
    expect(result).to.contain('<name></name>');
    assertXmlPackage(result);
  });

  it('should handle multiple complete types blocks', () => {
    const text = `    <types>\n        <members>ApexClass1</members>\n        <members>fgdfgdfg</members>\n        <members>ApexClass3</members>\n        <members>ApexClass4</members>\n        <name>ApexClass</name>\n    </types>\n    <types>\n        <members>ApexComponent1</members>\n        <members>ApexComponent2</members>\n        <members>ApexComponent3</members>\n        <members>ApexComponent4</members>\n        <name>ApexComponent</name>\n    </types>`;
    const ranges = [{ start: 0, end: text.length }];
    const result = buildPackageFromText(text, ranges);
    expect(result).to.contain('<name>ApexClass</name>');
    expect(result).to.contain('<name>ApexComponent</name>');
    expect(result).to.contain('<members>ApexClass1</members>');
    expect(result).to.contain('<members>ApexComponent4</members>');
    assertXmlPackage(result);
  });

  it('should error on only <types> tag', () => {
    const text = `<types>`;
    const ranges = [{ start: 0, end: text.length }];
    const result = buildPackageFromText(text, ranges);
    expect(result).to.be.undefined;
  });

  it('should handle single member with package string', () => {
    const text = `<members>ApexClass1</members>`;
    const ranges = [{ start: 0, end: text.length }];
    const result = buildPackageFromText(text, ranges);
    expect(result).to.contain('<members>ApexClass1</members>');
    expect(result).to.contain('<name></name>');
    expect(result).to.contain(`<version>64.0</version>`);
    assertXmlPackage(result);
  });

  it('should handle <types> block with members but missing <name>', () => {
    const text = `<types>\n<members>LWC1</members>\n<members>LWC2</members>\n<members>LWC3</members>\n<members>LWC4</members>\n<members>LWC5</members>\n</types>`;
    const ranges = [{ start: 0, end: text.length }];
    const result = buildPackageFromText(text, ranges);
    expect(result).to.contain('<members>LWC1</members>');
    expect(result).to.contain('<members>LWC5</members>');
    expect(result).to.contain('<name></name>');
    assertXmlPackage(result);
  });

  it('should handle two different members from different types', () => {
    const text = `<members>ApexClass4</members>\n<name>ApexClass</name>\n<members>ApexComponent3</members>\n<name>ApexComponent</name>`;
    const ranges = [{ start: 0, end: text.length }];
    const result = buildPackageFromText(text, ranges);
    expect(result).to.contain('<name>ApexClass</name>');
    expect(result).to.contain('<name>ApexComponent</name>');
    expect(result).to.contain('<members>ApexClass4</members>');
    expect(result).to.contain('<members>ApexComponent3</members>');
    assertXmlPackage(result);
  });

  it('should group multi-cursor selection of same type members', () => {
    const text = `<members>ApexClass3</members>\n<members>ApexClass4</members>\n<name>ApexClass</name>`;
    const ranges = [{ start: 0, end: text.length }];
    const result = buildPackageFromText(text, ranges);
    expect(result).to.contain('<members>ApexClass3</members>');
    expect(result).to.contain('<members>ApexClass4</members>');
    expect(result).to.contain('<name>ApexClass</name>');
    assertXmlPackage(result);
  });

  it('should error gracefully on invalid XML', () => {
    const text = `<members>ApexClass1`;
    const ranges = [{ start: 0, end: text.length }];
    const result = buildPackageFromText(text, ranges);
    expect(result).to.be.undefined;
  });
});
