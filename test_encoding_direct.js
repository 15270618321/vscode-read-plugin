const fs = require('fs');
const path = require('path');

// 直接测试编码解码
function testEncodingDirect() {
    // 请输入测试文件路径
    const testFilePath = ''; // 请设置测试文件路径
    
    if (!testFilePath || !fs.existsSync(testFilePath)) {
        console.log('请设置有效的测试文件路径');
        return;
    }

    console.log(`测试文件: ${testFilePath}`);
    
    try {
        // 读取原始字节
        const buffer = fs.readFileSync(testFilePath);
        console.log(`文件大小: ${buffer.length} 字节`);
        
        // 直接尝试不同编码
        console.log('\n尝试不同编码:');
        const encodings = ['gb2312', 'gbk', 'gb18030', 'utf8', 'latin1'];
        
        encodings.forEach(enc => {
            try {
                const content = buffer.toString(enc);
                console.log(`\n=== ${enc} ===`);
                console.log(content.substring(0, 500) + '...');
                
                // 检查是否有乱码（包含大量控制字符或无效字符）
                let controlCharCount = 0;
                let chineseCharCount = 0;
                
                for (let i = 0; i < content.length; i++) {
                    const code = content.charCodeAt(i);
                    if (code < 32 && code !== 9 && code !== 10 && code !== 13) {
                        controlCharCount++;
                    } else if (code >= 0x4E00 && code <= 0x9FFF) {
                        chineseCharCount++;
                    }
                }
                
                console.log(`控制字符数: ${controlCharCount}`);
                console.log(`中文字符数: ${chineseCharCount}`);
                console.log(`乱码比例: ${(controlCharCount / content.length * 100).toFixed(2)}%`);
                console.log(`中文比例: ${(chineseCharCount / content.length * 100).toFixed(2)}%`);
                
            } catch (e) {
                console.log(`\n=== ${enc} (失败) ===`);
                console.log(`错误: ${e.message}`);
            }
        });
        
    } catch (error) {
        console.error('测试失败:', error.message);
    }
}

// 运行测试
testEncodingDirect();
