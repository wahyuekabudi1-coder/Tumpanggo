import fs from 'fs';
import path from 'path';

interface TestResult {
  title: string;
  passed: boolean;
  message: string;
}

const testResults: TestResult[] = [];

function assert(condition: boolean, title: string, message: string = '') {
  testResults.push({
    title,
    passed: condition,
    message: condition ? (message || 'PASSED') : `FAILED: ${message}`
  });
  console.log(`${condition ? '✅ [PASS]' : '❌ [FAIL]'} ${title} ${message ? `(${message})` : ''}`);
}

async function runDirectLoginTests() {
  console.log('=== TEST SUITE: DIRECT LOGIN & REGISTRATION FLOW (PORTAL MITRA TUMPANGGO) ===\n');

  const partnerHubPath = path.resolve(process.cwd(), 'src/components/PartnerPortalHub.tsx');
  assert(fs.existsSync(partnerHubPath), 'File PartnerPortalHub.tsx exists');

  const src = fs.readFileSync(partnerHubPath, 'utf-8');

  // 1. Direct transition from role selection to login
  const hasDirectRoleToLogin = src.includes("const handleSelectRole = (role: PartnerRole) => {") &&
    src.includes("setSelectedRole(role);") &&
    src.includes("setStep('login');");
  assert(hasDirectRoleToLogin, 'Pemilihan peran (Toko / Kurir) langsung mengarahkan ke form login (setStep("login")), tanpa layar perantara');

  // 2. Initial state defaults to login if role is provided
  const hasDefaultLoginState = src.includes("initialRole ? (initialStep === 'action_selection' ? 'login' : (initialStep || 'login')) : 'role_selection'");
  assert(hasDefaultLoginState, 'State awal langsung mengarah ke login saat initialRole terdefinisi');

  // 3. Direct Login Screen structure & elements
  const hasLoginStep = src.includes("if (step === 'login')");
  assert(hasLoginStep, 'Layar login langsung (step === "login") terdefinisi dengan jelas');

  const hasMerchantHeading = src.includes("'Akses Masuk Mitra Toko'");
  const hasDriverHeading = src.includes("'Akses Masuk Mitra Kurir'");
  assert(hasMerchantHeading && hasDriverHeading, 'Heading login peran spesifik: "Akses Masuk Mitra Toko" & "Akses Masuk Mitra Kurir"');

  const hasBackToRolesFromLogin = src.includes("renderTopNav(() => setStep('role_selection')") &&
    src.includes("'Kembali ke Pemilihan Jenis Mitra'");
  assert(hasBackToRolesFromLogin, 'Tombol kembali di layar login mengembalikan langsung ke pemilihan jenis mitra');

  const hasIdentifierInput = src.includes('id="portal-login-identifier"');
  const hasPasswordInput = src.includes('id="portal-login-password"');
  const hasPasswordToggle = src.includes('setShowLoginPassword(!showLoginPassword)');
  assert(hasIdentifierInput && hasPasswordInput && hasPasswordToggle, 'Form login memiliki input identifier, password, dan tombol toggle visibility (Eye/EyeOff)');

  const hasMerchantSubmitBtn = src.includes("'Masuk ke Dashboard Merchant'");
  const hasDriverSubmitBtn = src.includes("'Masuk ke Dashboard Driver'");
  assert(hasMerchantSubmitBtn && hasDriverSubmitBtn, 'Tombol submit login spesifik peran ("Masuk ke Dashboard Merchant" / "Masuk ke Dashboard Driver")');

  const hasRegisterLinkUnderBtn = src.includes('id="portal-link-register"') &&
    src.includes('Belum punya akun mitra?') &&
    src.includes('Daftar sekarang.');
  assert(hasRegisterLinkUnderBtn, 'Tepat di bawah tombol login terdapat tautan bersih "Belum punya akun mitra? Daftar sekarang."');

  // 4. Registration Screen structure & elements
  const hasBackToLoginFromRegister = src.includes("renderTopNav(() => setStep('login')") &&
    (src.includes("'Kembali ke Login Mitra Toko'") || src.includes("'Kembali ke Login Mitra Kurir'"));
  assert(hasBackToLoginFromRegister, 'Tombol kembali di formulir pendaftaran mengembalikan langsung ke layar login peran tersebut');

  const hasLoginLinkUnderRegister = src.includes('id="portal-link-login"') &&
    src.includes('Sudah memiliki akun') &&
    src.includes('Masuk di sini.');
  assert(hasLoginLinkUnderRegister, 'Formulir pendaftaran menyediakan tautan balik ke form login');

  // 5. Authentication endpoint and error handling preserved
  const hasAuthFetch = src.includes("fetch('/api/login'");
  const hasTokenStorage = src.includes("safeStorage.setItem('tumpang_auth_token', data.token)");
  const hasRoleCallback = src.includes("onLoginSuccess(selectedRole, entityId, cleanUser)");
  const hasPendingDetection = src.includes("data?.isPendingApproval || (data?.error && data.error.includes('peninjauan'))");
  assert(hasAuthFetch && hasTokenStorage && hasRoleCallback && hasPendingDetection, 'Integritas autentikasi /api/login, session token, callback onLoginSuccess, dan penanganan status PENDING peninjauan tetap utuh');

  // 6. Registration endpoint and payload preserved
  const hasRegFetch = src.includes("fetch('/api/partner-registrations'");
  const hasMerchantReg = src.includes("type: 'MERCHANT'");
  const hasDriverReg = src.includes("type: 'DRIVER'");
  assert(hasRegFetch && hasMerchantReg && hasDriverReg, 'Pendaftaran mitra toko dan kurir ke endpoint /api/partner-registrations tetap utuh');

  console.log('\n=== SUMMARY ===');
  const total = testResults.length;
  const passed = testResults.filter(r => r.passed).length;
  const failed = testResults.filter(r => !r.passed).length;
  console.log(`Total Tests: ${total} | Passed: ${passed} | Failed: ${failed}`);

  if (failed > 0) {
    console.error('❌ SOME TESTS FAILED');
    process.exit(1);
  } else {
    console.log('🎉 ALL DIRECT LOGIN & REGISTRATION FLOW TESTS PASSED!');
  }
}

runDirectLoginTests().catch(err => {
  console.error(err);
  process.exit(1);
});
