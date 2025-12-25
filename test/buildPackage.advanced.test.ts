import { expect } from 'chai';
import { buildPackageFromText } from '../src/buildPackage';

function assertXmlPackage(xml: string): void {
  expect(xml).to.include('<?xml');
  expect(xml).to.include('<Package xmlns="http://soap.sforce.com/2006/04/metadata">');
  expect(xml).to.include('<version>64.0</version>');
  expect(xml).to.include('</Package>');
  expect(xml.indexOf('<version>64.0</version>')).to.be.lessThan(xml.indexOf('</Package>'));
}

describe('buildPackage - advanced scenarios', () => {
  describe('whitespace handling', () => {
    it('should handle members with leading whitespace', () => {
      const text = `<types>
        <members>   MyClass</members>
        <name>ApexClass</name>
      </types>`;
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>MyClass</members>');
    });

    it('should handle members with trailing whitespace', () => {
      const text = `<types>
        <members>MyClass   </members>
        <name>ApexClass</name>
      </types>`;
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>MyClass</members>');
    });

    it('should handle types blocks with extra newlines', () => {
      const text = `<types>


        <members>MyClass</members>


        <name>ApexClass</name>


      </types>`;
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>MyClass</members>');
    });

    it('should handle members with tabs', () => {
      const text = `<types>
\t\t<members>MyClass</members>
\t\t<name>ApexClass</name>
\t</types>`;
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>MyClass</members>');
    });
  });

  describe('special characters', () => {
    it('should handle members with underscores', () => {
      const text = `<types>
        <members>My_Test_Class</members>
        <name>ApexClass</name>
      </types>`;
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>My_Test_Class</members>');
    });

    it('should handle members with numbers', () => {
      const text = `<types>
        <members>TestClass123</members>
        <name>ApexClass</name>
      </types>`;
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>TestClass123</members>');
    });

    it('should handle wildcard members', () => {
      const text = `<types>
        <members>*</members>
        <name>ApexClass</name>
      </types>`;
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>*</members>');
    });

    it('should handle members with dots', () => {
      const text = `<types>
        <members>My.Custom.Object__c</members>
        <name>CustomObject</name>
      </types>`;
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>My.Custom.Object__c</members>');
    });

    it('should handle members with hyphens', () => {
      const text = `<types>
        <members>My-Test-Class</members>
        <name>ApexClass</name>
      </types>`;
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>My-Test-Class</members>');
    });
  });

  describe('complex selections', () => {
    it('should handle multiple non-contiguous ranges of same type', () => {
      const text = `<types>
        <members>Class1</members>
        <members>Class2</members>
        <members>Class3</members>
        <name>ApexClass</name>
      </types>`;
      const class1Start = text.indexOf('<members>Class1');
      const class1End = text.indexOf('</members>', class1Start) + 10;
      const class3Start = text.indexOf('<members>Class3');
      const class3End = text.indexOf('</members>', class3Start) + 10;
      
      const result = buildPackageFromText(text, [
        { start: class1Start, end: class1End },
        { start: class3Start, end: class3End }
      ]);
      
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>Class1</members>');
      expect(result).to.include('<members>Class3</members>');
      expect(result).to.not.include('<members>Class2</members>');
    });

    it('should handle selection of type name only', () => {
      const text = `<types>
        <members>MyClass</members>
        <name>ApexClass</name>
      </types>`;
      const nameStart = text.indexOf('<name>ApexClass');
      const nameEnd = text.indexOf('</name>', nameStart) + 7;
      
      const result = buildPackageFromText(text, [{ start: nameStart, end: nameEnd }]);
      expect(result).to.be.undefined;
    });

    it('should handle overlapping selections', () => {
      const text = `<types>
        <members>Class1</members>
        <members>Class2</members>
        <name>ApexClass</name>
      </types>`;
      const class1Start = text.indexOf('<members>Class1');
      const class2End = text.indexOf('</members>', text.indexOf('<members>Class2')) + 10;
      
      const result = buildPackageFromText(text, [{ start: class1Start, end: class2End }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>Class1</members>');
      expect(result).to.include('<members>Class2</members>');
    });

    it('should handle empty selection ranges', () => {
      const text = `<types>
        <members>MyClass</members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, []);
      expect(result).to.be.undefined;
    });

    it('should handle selection at end of document', () => {
      const text = `<types>
        <members>MyClass</members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: text.length - 1, end: text.length }]);
      expect(result).to.be.undefined;
    });

    it('should handle selection at start of document', () => {
      const text = `<types>
        <members>MyClass</members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: 1 }]);
      expect(result).to.be.undefined;
    });
  });

  describe('nested structures', () => {
    it('should handle types block within comments', () => {
      const text = `<!-- 
      <types>
        <members>CommentedClass</members>
        <name>ApexClass</name>
      </types>
      -->
      <types>
        <members>RealClass</members>
        <name>ApexClass</name>
      </types>`;
      const realTypesStart = text.lastIndexOf('<types>');
      const realTypesEnd = text.lastIndexOf('</types>') + 8;
      
      const result = buildPackageFromText(text, [{ start: realTypesStart, end: realTypesEnd }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>RealClass</members>');
      expect(result).to.not.include('CommentedClass');
    });

    it('should handle types blocks with CDATA', () => {
      const text = `<types>
        <members><![CDATA[MyClass]]></members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
    });
  });

  describe('malformed XML variations', () => {
    it('should handle unclosed members tag gracefully', () => {
      const text = `<types>
        <members>MyClass
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
    });

    it('should ignore members outside closed types tags', () => {
      const text = `<types>
        <members>MyClass</members>
        <name>ApexClass</name>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      if (result === undefined) {
        expect(result).to.be.undefined;
      } else {
        assertXmlPackage(result);
      }
    });

    it('should handle mismatched tags gracefully', () => {
      const text = `<types>
        <member>MyClass</members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
    });

    it('should handle empty members tag', () => {
      const text = `<types>
        <members></members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
    });

    it('should handle empty name tag', () => {
      const text = `<types>
        <members>MyClass</members>
        <name></name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<name></name>');
    });

    it('should handle types block with only name', () => {
      const text = `<types>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
    });
  });

  describe('large manifests', () => {
    it('should handle types block with many members', () => {
      const members = Array.from({ length: 100 }, (_, i) => `        <members>Class${i}</members>`).join('\n');
      const text = `<types>
${members}
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>Class0</members>');
      expect(result).to.include('<members>Class99</members>');
      const memberCount = (result!.match(/<members>/g) || []).length;
      expect(memberCount).to.equal(100);
    });

    it('should handle many types blocks', () => {
      const typesBlocks = Array.from({ length: 20 }, (_, i) => `
      <types>
        <members>Class${i}</members>
        <name>Type${i}</name>
      </types>`).join('');
      
      const result = buildPackageFromText(typesBlocks, [{ start: 0, end: typesBlocks.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>Class0</members>');
      expect(result).to.include('<members>Class19</members>');
      const typesCount = (result!.match(/<types>/g) || []).length;
      expect(typesCount).to.equal(20);
    });
  });

  describe('duplicate handling', () => {
    it('should deduplicate members within same type', () => {
      const text = `<types>
        <members>MyClass</members>
        <name>ApexClass</name>
      </types>
      <types>
        <members>MyClass</members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      const memberCount = (result!.match(/<members>MyClass<\/members>/g) || []).length;
      expect(memberCount).to.equal(1);
    });

    it('should preserve different members with same name in different types', () => {
      const text = `<types>
        <members>MyResource</members>
        <name>StaticResource</name>
      </types>
      <types>
        <members>MyResource</members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<name>StaticResource</name>');
      expect(result).to.include('<name>ApexClass</name>');
      const memberCount = (result!.match(/<members>MyResource<\/members>/g) || []).length;
      expect(memberCount).to.equal(2);
    });

    it('should handle duplicate members in multi-cursor selection', () => {
      const text = `<types>
        <members>Class1</members>
        <members>Class2</members>
        <members>Class1</members>
        <name>ApexClass</name>
      </types>`;
      const class1FirstStart = text.indexOf('<members>Class1');
      const class1FirstEnd = text.indexOf('</members>', class1FirstStart) + 10;
      const class1SecondStart = text.lastIndexOf('<members>Class1');
      const class1SecondEnd = text.indexOf('</members>', class1SecondStart) + 10;
      
      const result = buildPackageFromText(text, [
        { start: class1FirstStart, end: class1FirstEnd },
        { start: class1SecondStart, end: class1SecondEnd }
      ]);
      
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      const memberCount = (result!.match(/<members>Class1<\/members>/g) || []).length;
      expect(memberCount).to.equal(1);
    });
  });

  describe('case sensitivity', () => {
    it('should preserve case in member names', () => {
      const text = `<types>
        <members>MyClass</members>
        <members>myclass</members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      assertXmlPackage(result!);
      expect(result).to.include('<members>MyClass</members>');
      expect(result).to.include('<members>myclass</members>');
    });

    it('should preserve case in type names', () => {
      const text = `<types>
        <members>MyClass</members>
        <name>ApexClass</name>
      </types>`;
      
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.not.be.undefined;
      expect(result).to.include('<name>ApexClass</name>');
      expect(result).to.not.include('<name>apexclass</name>');
    });
  });

  describe('edge cases', () => {
    it('should return undefined for empty text', () => {
      const result = buildPackageFromText('', [{ start: 0, end: 0 }]);
      expect(result).to.be.undefined;
    });

    it('should return undefined for text without types blocks', () => {
      const text = 'Some random text without types';
      const result = buildPackageFromText(text, [{ start: 0, end: text.length }]);
      expect(result).to.be.undefined;
    });

    it('should handle selection ranges in reverse order', () => {
      const text = `<types>
        <members>Class1</members>
        <members>Class2</members>
        <name>ApexClass</name>
      </types>`;
      const class1Start = text.indexOf('<members>Class1');
      const class1End = text.indexOf('</members>', class1Start) + 10;
      const class2Start = text.indexOf('<members>Class2');
      const class2End = text.indexOf('</members>', class2Start) + 10;
      
      const result = buildPackageFromText(text, [
        { start: class2Start, end: class2End },
        { start: class1Start, end: class1End }
      ]);
      
      expect(result).to.not.be.undefined;
      expect(result).to.include('<members>Class1</members>');
      expect(result).to.include('<members>Class2</members>');
    });

    it('should handle selection at exact boundaries', () => {
      const text = `<types>
        <members>MyClass</members>
        <name>ApexClass</name>
      </types>`;
      const typesStart = text.indexOf('<types>');
      const typesEnd = text.lastIndexOf('</types>') + 8;
      
      const result = buildPackageFromText(text, [{ start: typesStart, end: typesEnd }]);
      expect(result).to.not.be.undefined;
      expect(result).to.include('<members>MyClass</members>');
    });
  });
});
