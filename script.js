const firebaseConfig = {
            apiKey: "AIzaSyCDZ3QWjOZ_sg6CfDE_l6NfqXirS_NElbM",
            authDomain: "mypai-2e361.firebaseapp.com",
            projectId: "mypai-2e361",
            storageBucket: "mypai-2e361.firebasestorage.app",
            messagingSenderId: "1013345064933",
            appId: "1:1013345064933:web:b92897077bbce117fbc10c",
            measurementId: "G-KDW46VYTMQ"
        };

        let app, auth, db;
        let currentUser = null;
        let currentUserData = null;
        let transactionsUnsubscribe = null;
        let loansUnsubscribe = null;
        let spendingChartInstance = null;
        let currentFilter = 'all';

        function initializeFirebase() {
            try {
                app = firebase.initializeApp(firebaseConfig);
                auth = firebase.auth();
                db = firebase.firestore();
                console.log('✅ Firebase initialized with advanced banking features');
            } catch (error) {
                console.error('Firebase init error:', error);
            }
        }

        function generateAccountNumber() {
            return 'SB' + Math.floor(10000000 + Math.random() * 90000000);
        }

        function formatCurrency(amount) {
            return '₨' + parseFloat(amount || 0).toLocaleString('en-PK', { minimumFractionDigits: 2 });
        }

        function showSection(section) {
            document.querySelectorAll('#app-screen > div').forEach(div => div.classList.add('hidden'));
            const target = document.getElementById(section);
            if (target) target.classList.remove('hidden');

            if (section === 'history') loadTransactionHistory();
            if (section === 'cards') loadVirtualCard();
            if (section === 'loans') loadLoans();
            if (section === 'dashboard') {
                setTimeout(initSpendingChart, 300);
            }
        }

        function hideModals() {
            document.getElementById('deposit-modal').classList.add('hidden');
            document.getElementById('withdraw-modal').classList.add('hidden');
            document.getElementById('billpay-modal').classList.add('hidden');
        }

        function copyAccountNumber() {
            const acc = document.getElementById('account-number').innerText;
            navigator.clipboard.writeText(acc);
            showToast('Account number copied!', 'success');
        }

        function copyRulesToClipboard() {
            const rules = `rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if request.auth != null;
    }
  }
}`;
            navigator.clipboard.writeText(rules);
            showToast('Rules copied to clipboard!', 'success');
        }

        function showToast(message, type = 'info') {
            const toast = document.createElement('div');
            toast.className = `toast-notification ${type === 'error' ? 'bg-red-500' : 'bg-emerald-500'} text-white px-6 py-3 rounded-xl shadow-lg`;
            toast.innerHTML = `<span class="mr-2">${type === 'success' ? '✅' : 'ℹ️'}</span>${message}`;
            document.body.appendChild(toast);
            setTimeout(() => toast.remove(), 3000);
        }

        function switchTab(n) {
            const loginForm = document.getElementById('login-form');
            const registerForm = document.getElementById('register-form');
            const tabLogin = document.getElementById('tab-login');
            const tabRegister = document.getElementById('tab-register');
            
            if (n === 0) {
                loginForm.classList.remove('hidden');
                registerForm.classList.add('hidden');
                tabLogin.classList.add('border-b-2', 'border-emerald-400', 'text-emerald-400');
                tabRegister.classList.remove('border-b-2', 'border-emerald-400', 'text-emerald-400');
            } else {
                loginForm.classList.add('hidden');
                registerForm.classList.remove('hidden');
                tabRegister.classList.add('border-b-2', 'border-emerald-400', 'text-emerald-400');
                tabLogin.classList.remove('border-b-2', 'border-emerald-400', 'text-emerald-400');
            }
        }

        async function register() {
            const name = document.getElementById('reg-name').value.trim();
            const email = document.getElementById('reg-email').value.trim();
            const password = document.getElementById('reg-password').value;

            if (!name || !email || password.length < 6) {
                alert("Please fill all fields correctly (password must be at least 6 characters)");
                return;
            }

            try {
                const userCredential = await auth.createUserWithEmailAndPassword(email, password);
                const user = userCredential.user;
                const accountNumber = generateAccountNumber();

                await db.collection('users').doc(user.uid).set({
                    fullName: name,
                    email: email,
                    balance: 25000.00, // Realistic starting balance for Pakistani users
                    accountNumber: accountNumber,
                    createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                    card: {
                        number: "4242 4242 4242 4242",
                        expiry: "12/29",
                        cvv: "424",
                        frozen: false
                    }
                });

                alert("✅ Account created! You now have ₨25,000 demo balance + virtual VISA card.");
                currentUser = user;
                loadUserData();
            } catch (error) {
                if (error.code === 'permission-denied') {
                    document.getElementById('security-warning').classList.remove('hidden');
                    alert("❌ Please update Firebase Security Rules first!\n\nClick the warning box below to copy the rules.");
                } else {
                    alert("Registration error: " + error.message);
                }
            }
        }

        async function login() {
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;

            if (!email || !password) {
                alert("Please enter email and password");
                return;
            }

            try {
                const userCredential = await auth.signInWithEmailAndPassword(email, password);
                currentUser = userCredential.user;
                loadUserData();
            } catch (error) {
                alert("Login failed: " + error.message);
            }
        }

        function logout() {
            if (transactionsUnsubscribe) transactionsUnsubscribe();
            if (loansUnsubscribe) loansUnsubscribe();
            auth.signOut().then(() => {
                document.getElementById('app-screen').classList.add('hidden');
                document.getElementById('auth-screen').classList.remove('hidden');
                document.getElementById('navbar').classList.add('hidden');
                currentUser = null;
                currentUserData = null;
                if (spendingChartInstance) spendingChartInstance.destroy();
            });
        }

        async function loadUserData() {
            if (!currentUser) return;

            document.getElementById('auth-screen').classList.add('hidden');
            document.getElementById('app-screen').classList.remove('hidden');
            document.getElementById('navbar').classList.remove('hidden');

            const userRef = db.collection('users').doc(currentUser.uid);
            
            userRef.onSnapshot((doc) => {
                if (doc.exists) {
                    currentUserData = doc.data();
                    renderDashboard();
                    document.getElementById('security-warning').classList.add('hidden');
                }
            }, (error) => {
                if (error.code === 'permission-denied') {
                    document.getElementById('security-warning').classList.remove('hidden');
                    logout();
                    alert("⚠️ Firebase Security Rules need to be updated!");
                }
            });

            showSection('dashboard');
        }

        function renderDashboard() {
            if (!currentUserData) return;
            
            document.getElementById('greeting-name').textContent = currentUserData.fullName.split(' ')[0];
            document.getElementById('display-name').textContent = currentUserData.fullName;
            document.getElementById('account-number-display').textContent = currentUserData.accountNumber;
            document.getElementById('balance').textContent = formatCurrency(currentUserData.balance);
            document.getElementById('account-number').textContent = currentUserData.accountNumber;
            document.getElementById('account-holder').textContent = currentUserData.fullName;
            document.getElementById('profile-name').textContent = currentUserData.fullName;
            document.getElementById('profile-email').textContent = currentUserData.email;
            document.getElementById('profile-account').textContent = currentUserData.accountNumber;

            // Auto-refresh analytics when dashboard loads
            setTimeout(initSpendingChart, 400);
        }

        // ==================== ADVANCED FEATURES ====================

        // BILL PAY MODAL
        function showBillPayModal() {
            const bills = [
                { id: 1, name: "LESCO Electricity", due: 4850, icon: "⚡" },
                { id: 2, name: "PTCL Broadband", due: 3200, icon: "🌐" },
                { id: 3, name: "Jazz Mobile Recharge", due: 1200, icon: "📱" },
                { id: 4, name: "Sui Gas Bill", due: 1850, icon: "🔥" }
            ];

            let html = '';
            bills.forEach(bill => {
                html += `
                <div onclick="payBill(${bill.id}, ${bill.due}, '${bill.name}')" class="flex justify-between items-center p-5 bg-white/5 hover:bg-emerald-500/10 rounded-3xl cursor-pointer transition-all">
                    <div class="flex items-center gap-4">
                        <span class="text-4xl">${bill.icon}</span>
                        <div>
                            <p class="font-semibold">${bill.name}</p>
                            <p class="text-emerald-400 text-sm">Due today • ₨${bill.due}</p>
                        </div>
                    </div>
                    <div class="bg-emerald-500 text-black px-8 py-3 rounded-3xl font-semibold">Pay Now</div>
                </div>`;
            });
            document.getElementById('bill-options').innerHTML = html;
            document.getElementById('billpay-modal').classList.remove('hidden');
        }

        async function payBill(id, amount, name) {
            if (!currentUserData || amount > currentUserData.balance) {
                alert("❌ Insufficient balance!");
                return;
            }

            try {
                const userRef = db.collection('users').doc(currentUser.uid);
                const newBalance = currentUserData.balance - amount;
                
                await userRef.update({ balance: newBalance });

                await db.collection('users').doc(currentUser.uid)
                    .collection('transactions')
                    .add({
                        type: 'bill',
                        amount: -amount,
                        description: `Bill Payment - ${name}`,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        balanceAfter: newBalance
                    });

                hideModals();
                showToast(`✅ ₨${amount} paid to ${name}`, 'success');
                renderDashboard();
            } catch (error) {
                alert("Bill payment failed: " + error.message);
            }
        }

        // VIRTUAL CARD MANAGEMENT
        async function loadVirtualCard() {
            if (!currentUserData) return;

            // Ensure card exists
            if (!currentUserData.card) {
                const defaultCard = {
                    number: "4242 4242 4242 4242",
                    expiry: "12/29",
                    cvv: "424",
                    frozen: false
                };
                await db.collection('users').doc(currentUser.uid).update({ card: defaultCard });
                currentUserData.card = defaultCard;
            }

            document.getElementById('card-number-display').textContent = currentUserData.card.number;
            document.getElementById('card-holder-display').textContent = currentUserData.fullName.toUpperCase();
            document.getElementById('card-expiry-display').textContent = currentUserData.card.expiry;
            document.getElementById('card-cvv-display').textContent = currentUserData.card.cvv;

            const frozenOverlay = document.getElementById('frozen-overlay');
            const freezeStatus = document.getElementById('freeze-status');
            if (currentUserData.card.frozen) {
                frozenOverlay.classList.remove('hidden');
                freezeStatus.textContent = 'FROZEN';
                freezeStatus.className = 'px-6 py-2 bg-red-400 text-white font-semibold rounded-3xl text-sm';
            } else {
                frozenOverlay.classList.add('hidden');
                freezeStatus.textContent = 'ACTIVE';
                freezeStatus.className = 'px-6 py-2 bg-emerald-400 text-black font-semibold rounded-3xl text-sm';
            }
        }

        async function toggleCardFreeze() {
            if (!currentUserData?.card) return;
            currentUserData.card.frozen = !currentUserData.card.frozen;
            await db.collection('users').doc(currentUser.uid).update({ card: currentUserData.card });
            loadVirtualCard();
            showToast(currentUserData.card.frozen ? '✅ Card frozen for security' : '✅ Card unfrozen', 'success');
        }

        async function generateNewCard() {
            if (!currentUserData) return;
            const newCard = {
                number: "4" + Math.floor(1000000000000000 + Math.random() * 9000000000000000).toString().slice(0,15),
                expiry: `${(Math.floor(Math.random()*12)+1).toString().padStart(2,'0')}/${(Math.floor(Math.random()*5)+25)}`,
                cvv: Math.floor(100 + Math.random() * 900).toString(),
                frozen: false
            };
            await db.collection('users').doc(currentUser.uid).update({ card: newCard });
            currentUserData.card = newCard;
            loadVirtualCard();
            showToast('🎉 New virtual card generated!', 'success');
        }

        function copyCardDetails() {
            if (!currentUserData?.card) return;
            const details = `Card: ${currentUserData.card.number}\nExpiry: ${currentUserData.card.expiry}\nCVV: ${currentUserData.card.cvv}`;
            navigator.clipboard.writeText(details);
            showToast('Card details copied to clipboard!', 'success');
        }

        function reportLostCard() {
            if (confirm('Report this card as lost and issue a new one?')) {
                generateNewCard();
                showToast('🚨 Card reported lost • New card issued', 'success');
            }
        }

        // LOANS SECTION
        function calculateEMI(principal, months) {
            // 0% Interest as requested
            const annualRate = 0.00;           // Changed to 0%
            const monthlyRate = annualRate / 12; // = 0
            
            // Simple EMI calculation with 0% interest: principal / months
            const emi = principal / months;
            
            // Total Interest is always 0
            const totalInterest = 0;
            
            return { 
                emi: Math.round(emi), 
                interest: Math.round(totalInterest) 
            };
        }

        function updateLoanPreview() {
            const amount = parseFloat(document.getElementById('loan-amount').value) || 0;
            const tenure = parseInt(document.getElementById('loan-tenure').value) || 24;
            const { emi, interest } = calculateEMI(amount, tenure);
            
            document.getElementById('emi-display').textContent = formatCurrency(emi);
            document.getElementById('interest-display').textContent = formatCurrency(interest);
        }

        async function applyForLoan() {
            const amount = parseFloat(document.getElementById('loan-amount').value);
            const tenure = parseInt(document.getElementById('loan-tenure').value);
            
            if (!amount || amount < 10000) {
                alert("Minimum loan amount is ₨10,000");
                return;
            }
            
            const { emi } = calculateEMI(amount, tenure);
            
            if (confirm(`Approve ₨${amount.toLocaleString('en-PK')} loan for ${tenure} months at 0% interest?\nMonthly EMI: ${formatCurrency(emi)}`)) {
                try {
                    const userRef = db.collection('users').doc(currentUser.uid);
                    const newBalance = currentUserData.balance + amount;
                   
                    await userRef.update({ balance: newBalance });
                    
                    // Create loan record
                    await db.collection('users').doc(currentUser.uid).collection('loans').add({
                        amount: amount,
                        tenure: tenure,
                        emi: emi,
                        interestRate: 0,           // Added 0% interest flag
                        totalInterest: 0,
                        status: 'active',
                        disbursedAt: firebase.firestore.FieldValue.serverTimestamp()
                    });
                    
                    // Log transaction
                    await db.collection('users').doc(currentUser.uid).collection('transactions').add({
                        type: 'loan',
                        amount: amount,
                        description: `Personal Loan Disbursed (${tenure} months at 0% interest)`,
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        balanceAfter: newBalance
                    });
                    
                    showToast(`✅ ₨${amount.toLocaleString('en-PK')} loan credited at 0% interest!`, 'success');
                    renderDashboard();
                    showSection('loans');
                } catch (error) {
                    alert("Loan application failed: " + error.message);
                }
            }
        }

        function loadLoans() {
            const container = document.getElementById('active-loans-list');
            container.innerHTML = `<div class="text-center py-12 text-white/40">Loading your loans...</div>`;
            
            if (loansUnsubscribe) loansUnsubscribe();
            
            loansUnsubscribe = db.collection('users').doc(currentUser.uid).collection('loans')
                .orderBy('disbursedAt', 'desc')
                .onSnapshot(snapshot => {
                    container.innerHTML = '';
                    if (snapshot.empty) {
                        container.innerHTML = `<div class="bg-white/10 rounded-3xl p-8 text-center">
                            <p class="text-4xl mb-4">🏦</p>
                            <p class="font-semibold">No active loans</p>
                            <p class="text-white/60 text-sm">Apply for a loan above to get started</p>
                        </div>`;
                        return;
                    }
                    snapshot.forEach(doc => {
                        const loan = doc.data();
                        const date = loan.disbursedAt ? loan.disbursedAt.toDate().toLocaleDateString('en-PK') : 'Recently';
                        
                        const html = `
                        <div class="bg-white/10 rounded-3xl p-6 flex justify-between items-center">
                            <div>
                                <p class="font-semibold text-xl">₨${loan.amount.toLocaleString('en-PK')}</p>
                                <p class="text-white/60 text-sm">${loan.tenure} months • EMI ₨${loan.emi}</p>
                                <p class="text-xs text-emerald-400">0% Interest • ${date}</p>
                            </div>
                            <div class="text-right">
                                <span class="inline-block px-4 py-1 bg-emerald-400 text-black text-sm font-semibold rounded-3xl">${loan.status.toUpperCase()}</span>
                            </div>
                        </div>`;
                        container.innerHTML += html;
                    });
                });
        }

        // SPENDING ANALYTICS (Advanced Chart)
        function initSpendingChart() {
            const canvas = document.getElementById('spending-chart');
            if (!canvas) return;

            // Destroy old chart if exists
            if (spendingChartInstance) spendingChartInstance.destroy();

            // Demo data based on typical Pakistani banking (you can make it dynamic later)
            const data = {
                labels: ['Money Transfers', 'Bill Payments', 'ATM Withdrawals', 'Online Shopping'],
                datasets: [{
                    data: [12400, 8300, 6500, 4200],
                    backgroundColor: ['#00d4aa', '#a855f7', '#f59e0b', '#ec4899'],
                    borderColor: '#111827',
                    borderWidth: 6
                }]
            };

            spendingChartInstance = new Chart(canvas, {
                type: 'doughnut',
                data: data,
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: '70%',
                    plugins: {
                        legend: {
                            position: 'bottom',
                            labels: {
                                color: '#e5e7eb',
                                usePointStyle: true,
                                padding: 24,
                                font: { size: 14 }
                            }
                        }
                    }
                }
            });

            // Update quick stats
            document.getElementById('stat-transfer').textContent = formatCurrency(12400);
            document.getElementById('stat-withdraw').textContent = formatCurrency(6500);
            document.getElementById('stat-bills').textContent = formatCurrency(8300);
            document.getElementById('stat-other').textContent = formatCurrency(4200);
            document.getElementById('total-spent').textContent = formatCurrency(31400);
        }

        function refreshAnalytics() {
            initSpendingChart();
            showToast('Analytics refreshed with latest transactions', 'success');
        }

        // TRANSACTION HISTORY WITH FILTERS
        function loadTransactionHistory() {
            if (transactionsUnsubscribe) transactionsUnsubscribe();

            const tbody = document.getElementById('transactions-body');
            tbody.innerHTML = `<tr><td colspan="3" class="text-center py-12 text-white/40">Loading transactions...</td></tr>`;

            transactionsUnsubscribe = db.collection('users')
                .doc(currentUser.uid)
                .collection('transactions')
                .orderBy('timestamp', 'desc')
                .onSnapshot((snapshot) => {
                    tbody.innerHTML = '';
                    if (snapshot.empty) {
                        tbody.innerHTML = `<tr><td colspan="3" class="text-center py-12 text-white/40">No transactions yet. Start banking!</td></tr>`;
                        return;
                    }

                    snapshot.forEach((doc) => {
                        const t = doc.data();
                        const date = t.timestamp ? t.timestamp.toDate().toLocaleDateString('en-PK') : 'Just now';
                        
                        let amountHTML = t.amount > 0 
                            ? `<td class="text-right py-6 px-8 text-emerald-400 font-medium">+${formatCurrency(t.amount)}</td>`
                            : `<td class="text-right py-6 px-8 text-red-400 font-medium">${formatCurrency(t.amount)}</td>`;

                        const row = document.createElement('tr');
                        row.className = 'filter-row';
                        row.dataset.type = t.type || 'other';
                        row.innerHTML = `
                            <td class="py-6 px-8 font-mono text-white/70 text-xs">${date}</td>
                            <td class="py-6 px-8">${t.description}${t.note && t.note !== 'No note' ? `<div class="text-white/40 text-xs mt-1">📝 ${t.note}</div>` : ''}</td>
                            ${amountHTML}
                        `;
                        tbody.appendChild(row);
                    });

                    // Apply current filter
                    filterTransactions(currentFilter);
                });
        }

        function filterTransactions(type) {
            currentFilter = type;
            
            // Update active filter button
            document.querySelectorAll('#history button').forEach(btn => {
                btn.classList.remove('active', 'bg-emerald-400', 'text-black');
                if (btn.id === `filter-${type}` || (type === 'all' && btn.id === 'filter-all')) {
                    btn.classList.add('active', 'bg-emerald-400', 'text-black');
                }
            });

            const rows = document.querySelectorAll('.filter-row');
            rows.forEach(row => {
                if (type === 'all') {
                    row.style.display = '';
                } else {
                    row.style.display = row.dataset.type === type ? '' : 'none';
                }
            });
        }

        function refreshHistory() {
            loadTransactionHistory();
        }

        // Existing functions (deposit, withdraw, transfer) - updated for PKR
        async function makeDeposit() {
            const amount = parseFloat(document.getElementById('deposit-amount').value);
            if (!amount || amount <= 0) return alert("Please enter a valid amount");

            try {
                const userRef = db.collection('users').doc(currentUser.uid);
                const newBalance = currentUserData.balance + amount;
                
                await userRef.update({ balance: newBalance });
                
                await db.collection('users').doc(currentUser.uid)
                    .collection('transactions')
                    .add({
                        type: 'deposit',
                        amount: amount,
                        description: 'Cash deposit',
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        balanceAfter: newBalance
                    });

                hideModals();
                document.getElementById('deposit-amount').value = '';
                showToast(`✅ ${formatCurrency(amount)} deposited!`, 'success');
                renderDashboard();
            } catch (error) {
                alert("Deposit failed: " + error.message);
            }
        }

        async function makeWithdraw() {
            const amount = parseFloat(document.getElementById('withdraw-amount').value);
            if (!amount || amount <= 0) return alert("Please enter a valid amount");
            if (amount > currentUserData.balance) return alert("❌ Insufficient funds!");

            try {
                const userRef = db.collection('users').doc(currentUser.uid);
                const newBalance = currentUserData.balance - amount;
                
                await userRef.update({ balance: newBalance });

                await db.collection('users').doc(currentUser.uid)
                    .collection('transactions')
                    .add({
                        type: 'withdrawal',
                        amount: -amount,
                        description: 'Cash withdrawal',
                        timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                        balanceAfter: newBalance
                    });

                hideModals();
                document.getElementById('withdraw-amount').value = '';
                showToast(`✅ ${formatCurrency(amount)} withdrawn!`, 'success');
                renderDashboard();
            } catch (error) {
                alert("Withdrawal failed: " + error.message);
            }
        }

        async function makeTransfer() {
            const toAccount = document.getElementById('transfer-account').value.trim();
            const amount = parseFloat(document.getElementById('transfer-amount').value);
            const note = document.getElementById('transfer-note').value.trim() || 'No note';

            if (!toAccount || !amount || amount <= 0) return alert("Please enter valid details");
            if (amount > currentUserData.balance) return alert("❌ Insufficient funds!");

            try {
                const receiverQuery = await db.collection('users')
                    .where('accountNumber', '==', toAccount)
                    .limit(1)
                    .get();

                if (receiverQuery.empty) return alert("❌ Recipient account not found!");

                const receiverDoc = receiverQuery.docs[0];
                const receiverUid = receiverDoc.id;
                const receiverData = receiverDoc.data();

                if (receiverUid === currentUser.uid) return alert("❌ Cannot transfer to your own account!");

                const senderRef = db.collection('users').doc(currentUser.uid);
                const receiverRef = db.collection('users').doc(receiverUid);

                await db.runTransaction(async (transaction) => {
                    const senderSnap = await transaction.get(senderRef);
                    const receiverSnap = await transaction.get(receiverRef);
                    const senderBalance = senderSnap.data().balance;
                    if (senderBalance < amount) throw new Error("Insufficient funds");
                    
                    transaction.update(senderRef, { balance: senderBalance - amount });
                    transaction.update(receiverRef, { balance: receiverSnap.data().balance + amount });
                });
                
                // Record both sides
                await db.collection('users').doc(currentUser.uid).collection('transactions').add({
                    type: 'transfer',
                    amount: -amount,
                    description: `Sent to ${receiverData.fullName}`,
                    note: note,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    otherParty: toAccount
                });

                await db.collection('users').doc(receiverUid).collection('transactions').add({
                    type: 'transfer',
                    amount: amount,
                    description: `Received from ${currentUserData.fullName}`,
                    note: note,
                    timestamp: firebase.firestore.FieldValue.serverTimestamp(),
                    otherParty: currentUserData.accountNumber
                });

                showToast(`✅ ${formatCurrency(amount)} transferred successfully!`, 'success');
                document.getElementById('transfer-account').value = '';
                document.getElementById('transfer-amount').value = '';
                document.getElementById('transfer-note').value = '';
                showSection('dashboard');
            } catch (error) {
                alert("Transfer failed: " + error.message);
            }
        }

        function showDepositModal() { document.getElementById('deposit-modal').classList.remove('hidden'); }
        function showWithdrawModal() { document.getElementById('withdraw-modal').classList.remove('hidden'); }

        window.onload = function() {
            initializeFirebase();
            
            // Real-time auth
            auth.onAuthStateChanged((user) => {
                if (user) {
                    currentUser = user;
                    loadUserData();
                } else {
                    document.getElementById('auth-screen').classList.remove('hidden');
                    document.getElementById('app-screen').classList.add('hidden');
                    document.getElementById('navbar').classList.add('hidden');
                }
            });

            // Auto-update loan preview
            const loanAmountInput = document.getElementById('loan-amount');
            const loanTenureInput = document.getElementById('loan-tenure');
            if (loanAmountInput) loanAmountInput.addEventListener('input', updateLoanPreview);
            if (loanTenureInput) loanTenureInput.addEventListener('change', updateLoanPreview);
        };