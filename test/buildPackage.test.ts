import { expect } from 'chai';
import { buildPackageFromText } from '../src/buildPackage';

describe('buildPackageFromText', () => {
  it('builds package.xml from simple selection ranges', () => {
    const text = `
<Package>
<types>
  <members>MyClass</members>
  <name>ApexClass</name>
</types>
</Package>
`;
    const ranges = [{ start: text.indexOf('<members>'), end: text.indexOf('</name>') + '</name>'.length }];
    const pkg = buildPackageFromText(text, ranges as any);
    expect(pkg).to.be.a('string');
    const trimmed = pkg!.trim();
    expect(trimmed).to.include('<Package xmlns="http://soap.sforce.com/2006/04/metadata">');
    expect(trimmed).to.include('<version>64.0</version>');
    expect(trimmed.endsWith('</Package>')).to.be.true;
    const versionIndex = trimmed.indexOf('<version>64.0</version>');
    const closingIndex = trimmed.lastIndexOf('</Package>');
    
    expect(versionIndex).to.be.greaterThan(-1);
    expect(closingIndex).to.be.greaterThan(versionIndex);
    expect(pkg).to.include('<name>ApexClass</name>');
    expect(pkg).to.include('<members>MyClass</members>');
  });
});
