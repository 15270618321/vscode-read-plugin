const fs = require('fs');
const path = require('path');
const { EncodingUtils } = require('./out/utils/encodingUtils');

// 测试GB2312编码检测和读取
function testGB2312Encoding() {
    // 提示用户输入测试文件路径
    console.log('请输入GB2312编码的测试文件路径:');
    
    // 模拟测试 - 这里可以手动设置测试文件路径
    const testFilePath = ''; // 请在这里输入测试文件路径
    
    if (!testFilePath) {
        console.log('请设置测试文件路径后重新运行');
        return;
    }

    if (!fs.existsSync(testFilePath)) {
        console.log('测试文件不存在');
        return;
    }

    console.log(`\n测试文件: ${testFilePath}`);
    console.log(`文件大小: ${fs.statSync(testFilePath).size} 字节`);

    try {
        // 检测编码
        console.log('\n1. 检测编码:');
        const detectedEncoding = EncodingUtils.detectEncoding(testFilePath);
        console.log(`检测到的编码: ${detectedEncoding}`);

        // 读取文件
        console.log('\n2. 读取文件内容:');
        const fileSize = fs.statSync(testFilePath).size;
        const content = EncodingUtils.readFileWithEncoding(testFilePath, 0, Math.min(fileSize, 2048), detectedEncoding);
        console.log(`前500字符: ${content.substring(0, 500)}...`);

        // 尝试其他编码
        console.log('\n3. 尝试其他编码:');
        const encodings = ['gb2312', 'gbk', 'gb18030', 'utf8'];
        encodings.forEach(enc => {
            if (enc !== detectedEncoding) {
                try {
                    const altContent = EncodingUtils.readFileWithEncoding(testFilePath, 0, Math.min(fileSize, 2048), enc);
                    console.log(`\n使用 ${enc} 编码:`);
                    console.log(`${altContent.substring(0, 500)}...`);
                } catch (e) {
                    console.log(`\n使用 ${enc} 编码失败: ${e.message}`);
                }
            }
        });

    } catch (error) {
        console.error('测试失败:', error.message);
    }
}

// 运行测试
testGB2312Encoding();
